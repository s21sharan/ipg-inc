import uuid
import json
import numpy as np
from typing import Any
from openai import OpenAI
from sklearn.cluster import KMeans
from supabase import Client

from app.config import get_settings


class ClusteringService:
    """Service for clustering conversations into insight groups."""

    def __init__(self, db: Client):
        self.db = db
        settings = get_settings()
        self.openai = OpenAI(api_key=settings.openai_api_key)

    def get_completed_conversations(self, campaign_id: str) -> list[dict]:
        """Get all completed conversations for a campaign."""
        result = self.db.table("conversations").select(
            "*, interviews(name, summary, reflection_memory)"
        ).eq("campaign_id", campaign_id).eq("status", "completed").execute()
        return result.data or []

    def create_clustering_record(self, campaign_id: str) -> str:
        """Create a new clustering record."""
        cluster_id = str(uuid.uuid4())
        self.db.table("campaign_clusters").insert({
            "id": cluster_id,
            "campaign_id": campaign_id,
            "status": "processing",
        }).execute()
        return cluster_id

    def get_latest_clusters(self, campaign_id: str) -> dict:
        """Get the latest clustering results for a campaign."""
        result = self.db.table("campaign_clusters").select("*").eq(
            "campaign_id", campaign_id
        ).order("created_at", desc=True).limit(1).execute()

        if not result.data:
            return {
                "status": "none",
                "dimension": None,
                "dimension_rationale": None,
                "conversations_analyzed": None,
                "clusters": None,
            }

        cluster_data = result.data[0]
        return {
            "status": cluster_data["status"],
            "dimension": cluster_data.get("dimension"),
            "dimension_rationale": cluster_data.get("dimension_rationale"),
            "conversations_analyzed": cluster_data.get("conversations_analyzed"),
            "clusters": cluster_data.get("clusters"),
        }

    def get_cluster_details(self, cluster_id: str) -> dict | None:
        """Get details for a specific clustering run."""
        result = self.db.table("campaign_clusters").select("*").eq(
            "id", cluster_id
        ).single().execute()
        return result.data

    async def run_clustering(
        self,
        cluster_id: str,
        campaign_id: str,
        conversations: list[dict],
        num_clusters: int = 4,
    ):
        """Run clustering on conversations."""
        try:
            # Step 1: Detect dimension (pain_points vs goals)
            dimension, rationale = await self._detect_dimension(conversations)

            # Step 2: Extract quotes for clustering
            quotes_data = await self._extract_quotes(conversations, dimension)

            # Step 3: Generate embeddings
            embeddings = await self._generate_embeddings(quotes_data)

            # Step 4: K-means clustering
            labels = self._kmeans_cluster(embeddings, num_clusters)

            # Step 5: Label clusters
            clusters = await self._label_clusters(quotes_data, labels, num_clusters)

            # Save results
            self.db.table("campaign_clusters").update({
                "status": "completed",
                "dimension": dimension,
                "dimension_rationale": rationale,
                "conversations_analyzed": len(conversations),
                "clusters": clusters,
            }).eq("id", cluster_id).execute()

        except Exception as e:
            self.db.table("campaign_clusters").update({
                "status": "failed",
                "error": str(e),
            }).eq("id", cluster_id).execute()
            raise

    async def _detect_dimension(self, conversations: list[dict]) -> tuple[str, str]:
        """Detect whether to cluster by pain_points or goals."""
        # Sample some conversations
        sample = conversations[:10] if len(conversations) > 10 else conversations
        sample_text = self._build_sample_text(sample)

        response = self.openai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": """Analyze these interview excerpts and determine the best dimension for clustering users.

Choose either:
- "pain_points" - if users primarily discuss problems, frustrations, or issues
- "goals" - if users primarily discuss aspirations, desires, or what they want to achieve

Respond in JSON: {"dimension": "pain_points" or "goals", "rationale": "brief explanation"}"""},
                {"role": "user", "content": sample_text},
            ],
            max_tokens=200,
            temperature=0.3,
        )

        result = json.loads(response.choices[0].message.content)
        return result["dimension"], result["rationale"]

    async def _extract_quotes(
        self,
        conversations: list[dict],
        dimension: str,
    ) -> list[dict]:
        """Extract relevant quotes from each conversation."""
        quotes_data = []

        for conv in conversations:
            transcript = conv.get("transcript", [])
            participant_name = conv.get("participant_name", "Unknown")

            # Build transcript text
            transcript_text = "\n".join([
                f"{'Q' if item['role'] == 'interviewer' else 'A'}: {item['content']}"
                for item in transcript
            ])

            response = self.openai.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": f"""Extract 2-4 verbatim quotes that reveal this user's {dimension.replace('_', ' ')}.
Return JSON: {{"quotes": ["quote1", "quote2", ...]}}
Only include actual quotes from the participant (A:), not interviewer questions."""},
                    {"role": "user", "content": transcript_text},
                ],
                max_tokens=300,
                temperature=0.3,
            )

            try:
                result = json.loads(response.choices[0].message.content)
                quotes = result.get("quotes", [])
            except:
                quotes = []

            quotes_data.append({
                "conversation_id": conv["id"],
                "participant_name": participant_name,
                "quotes": quotes,
                "combined_text": " ".join(quotes),
            })

        return quotes_data

    async def _generate_embeddings(self, quotes_data: list[dict]) -> np.ndarray:
        """Generate embeddings for quote texts."""
        texts = [q["combined_text"] for q in quotes_data if q["combined_text"]]

        response = self.openai.embeddings.create(
            model="text-embedding-3-small",
            input=texts,
        )

        embeddings = np.array([item.embedding for item in response.data])
        return embeddings

    def _kmeans_cluster(self, embeddings: np.ndarray, num_clusters: int) -> np.ndarray:
        """Perform K-means clustering on embeddings."""
        kmeans = KMeans(n_clusters=num_clusters, random_state=42, n_init=10)
        labels = kmeans.fit_predict(embeddings)
        return labels

    async def _label_clusters(
        self,
        quotes_data: list[dict],
        labels: np.ndarray,
        num_clusters: int,
    ) -> list[dict]:
        """Generate labels and summaries for each cluster."""
        clusters = []

        for cluster_idx in range(num_clusters):
            # Get members of this cluster
            members = [
                quotes_data[i]
                for i, label in enumerate(labels)
                if label == cluster_idx
            ]

            if not members:
                continue

            # Combine quotes for labeling
            all_quotes = []
            for m in members:
                all_quotes.extend(m["quotes"])

            quotes_text = "\n".join([f"- {q}" for q in all_quotes[:20]])

            response = self.openai.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": """Generate a cluster label and summary based on these user quotes.
Return JSON: {
  "title": "3-5 word descriptive title",
  "summary": "One sentence description of what unifies this group"
}"""},
                    {"role": "user", "content": quotes_text},
                ],
                max_tokens=150,
                temperature=0.5,
            )

            try:
                result = json.loads(response.choices[0].message.content)
            except:
                result = {"title": f"Cluster {cluster_idx + 1}", "summary": ""}

            # Calculate confidence based on cluster cohesion
            confidence = min(0.95, 0.7 + (len(members) / 50) * 0.25)

            # Determine prevalence
            pct = len(members) / len(quotes_data)
            if pct >= 0.3:
                prevalence = "High"
            elif pct >= 0.15:
                prevalence = "Medium"
            else:
                prevalence = "Low"

            clusters.append({
                "id": str(uuid.uuid4()),
                "title": result["title"],
                "summary": result["summary"],
                "quotes": all_quotes[:4],
                "matched_users": len(members),
                "prevalence": prevalence,
                "confidence": round(confidence, 2),
                "members": [
                    {"conversation_id": m["conversation_id"], "participant_name": m["participant_name"]}
                    for m in members
                ],
            })

        return clusters

    def _build_sample_text(self, conversations: list[dict]) -> str:
        """Build sample text for dimension detection."""
        parts = []
        for conv in conversations:
            transcript = conv.get("transcript", [])
            participant_responses = [
                item["content"]
                for item in transcript
                if item["role"] == "participant"
            ]
            if participant_responses:
                parts.append("\n".join(participant_responses[:3]))
        return "\n\n---\n\n".join(parts)
