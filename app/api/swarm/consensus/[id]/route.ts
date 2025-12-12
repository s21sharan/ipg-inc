import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authHeader = request.headers.get('authorization');

    const response = await fetch(`${BACKEND_URL}/api/swarm/consensus/${id}`, {
      headers: {
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
    });

    // Handle non-JSON responses
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      return NextResponse.json(
        { detail: text || 'Backend error' },
        { status: response.status || 500 }
      );
    }

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Swarm consensus error:', error);
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : 'Failed to get swarm consensus' },
      { status: 500 }
    );
  }
}
