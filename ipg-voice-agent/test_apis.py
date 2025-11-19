#!/usr/bin/env python3
"""
Test script to verify all speech service APIs are working.
Tests: Deepgram (STT), Cartesia (TTS), Daily.co (WebRTC)
"""

import sys
import os
import asyncio
sys.path.insert(0, '/app')

from dotenv import load_dotenv
load_dotenv()

async def test_deepgram():
    """Test Deepgram STT API"""
    print("\n🎤 Testing Deepgram (STT)...")
    try:
        from deepgram import DeepgramClient

        api_key = os.getenv("DEEPGRAM_API_KEY")
        if not api_key:
            print("✗ DEEPGRAM_API_KEY not found in environment")
            return False

        print(f"  API Key: {api_key[:10]}...")

        # Test API connection by listing projects
        client = DeepgramClient(api_key)

        try:
            # Try to get projects list to verify key
            response = client.manage.v("1").get_projects()
            print(f"✓ Deepgram API key is valid")
            if hasattr(response, 'projects') and response.projects:
                print(f"  Projects found: {len(response.projects)}")
                if response.projects[0]:
                    project = response.projects[0]
                    print(f"  Project name: {project.name if hasattr(project, 'name') else 'N/A'}")
            return True
        except Exception as e:
            print(f"✗ Deepgram API authentication failed: {e}")
            return False

    except Exception as e:
        print(f"✗ Deepgram test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_cartesia():
    """Test Cartesia TTS API"""
    print("\n🔊 Testing Cartesia (TTS)...")
    try:
        import aiohttp

        api_key = os.getenv("CARTESIA_API_KEY")
        if not api_key:
            print("✗ CARTESIA_API_KEY not found in environment")
            return False

        print(f"  API Key: {api_key[:10]}...")

        # Test API connection - try to list voices
        headers = {
            "X-API-Key": api_key,
            "Cartesia-Version": "2024-06-10"
        }

        async with aiohttp.ClientSession() as session:
            async with session.get(
                "https://api.cartesia.ai/voices",
                headers=headers
            ) as response:
                if response.status == 200:
                    voices = await response.json()
                    print(f"✓ Cartesia API key is valid")
                    print(f"  Available voices: {len(voices)}")

                    # Check if configured voice exists
                    voice_id = os.getenv("CARTESIA_VOICE_ID")
                    if voice_id:
                        voice_found = any(v.get("id") == voice_id for v in voices)
                        if voice_found:
                            print(f"✓ Configured voice ID found: {voice_id}")
                        else:
                            print(f"⚠ Warning: Configured voice ID not found: {voice_id}")
                    return True
                else:
                    error = await response.text()
                    print(f"✗ Cartesia API authentication failed: {response.status}")
                    print(f"  Error: {error}")
                    return False

    except Exception as e:
        print(f"✗ Cartesia test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_daily():
    """Test Daily.co WebRTC API"""
    print("\n📹 Testing Daily.co (WebRTC)...")
    try:
        import aiohttp

        api_key = os.getenv("DAILY_API_KEY")
        if not api_key:
            print("✗ DAILY_API_KEY not found in environment")
            return False

        print(f"  API Key: {api_key[:10]}...")

        # Test API connection - try to list rooms
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }

        async with aiohttp.ClientSession() as session:
            # First, verify API key by getting account info
            async with session.get(
                "https://api.daily.co/v1/",
                headers=headers
            ) as response:
                if response.status == 200:
                    info = await response.json()
                    print(f"✓ Daily.co API key is valid")
                    print(f"  Domain: {info.get('domain_name', 'N/A')}")

                    # Check if rooms endpoint works
                    async with session.get(
                        "https://api.daily.co/v1/rooms",
                        headers=headers
                    ) as rooms_response:
                        if rooms_response.status == 200:
                            rooms_data = await rooms_response.json()
                            rooms = rooms_data.get("data", [])
                            print(f"  Rooms found: {len(rooms)}")
                        else:
                            print(f"  Could not fetch rooms: {rooms_response.status}")

                    return True
                else:
                    error = await response.text()
                    print(f"✗ Daily.co API authentication failed: {response.status}")
                    print(f"  Error: {error}")
                    return False

    except Exception as e:
        print(f"✗ Daily.co test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_openai():
    """Test OpenAI LLM API"""
    print("\n🤖 Testing OpenAI (LLM)...")
    try:
        import openai

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            print("✗ OPENAI_API_KEY not found in environment")
            return False

        print(f"  API Key: {api_key[:10]}...")

        # Test API connection with a simple completion
        client = openai.AsyncOpenAI(api_key=api_key)

        response = await client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": "Say 'API test successful' and nothing else."}],
            max_tokens=10
        )

        result = response.choices[0].message.content
        print(f"✓ OpenAI API key is valid")
        print(f"  Test response: {result}")
        return True

    except Exception as e:
        print(f"✗ OpenAI test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    """Run all API tests"""
    print("=" * 60)
    print("API CONNECTIVITY TEST")
    print("=" * 60)

    results = {
        "Deepgram": await test_deepgram(),
        "Cartesia": await test_cartesia(),
        "Daily.co": await test_daily(),
        "OpenAI": await test_openai()
    }

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)

    for service, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{service:15} {status}")

    all_passed = all(results.values())

    if all_passed:
        print("\n✅ All API tests passed!")
        return 0
    else:
        print("\n❌ Some API tests failed. Check your API keys and network connectivity.")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
