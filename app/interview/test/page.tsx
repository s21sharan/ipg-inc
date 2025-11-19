import InterviewLayout from '@/app/components/interview/InterviewLayout'

// Test page for interview UI without database dependency
export default function TestInterviewPage() {
  const mockCampaign = {
    id: 'test-campaign-123',
    name: 'Customer Feedback Interview',
    title: 'Understanding Your Product Experience',
    caption: 'We appreciate your time in helping us understand how we can better serve you. This interview will take approximately 15-20 minutes and will cover your experience with our product.',
    modality: 'Audio + Video',
    time_estimate: '15-20 minutes',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  return <InterviewLayout campaign={mockCampaign} />
}