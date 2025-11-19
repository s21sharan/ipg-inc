import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import InterviewLayout from '@/app/components/interview/InterviewLayout'

interface InterviewPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function InterviewPage({ params }: InterviewPageProps) {
  // Unwrap params Promise
  const { id } = await params

  // Fetch campaign data
  const { data: campaign, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !campaign) {
    notFound()
  }

  return <InterviewLayout campaign={campaign} />
}