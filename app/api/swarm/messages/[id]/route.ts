import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authHeader = request.headers.get('authorization');
    const searchParams = request.nextUrl.searchParams;
    const offset = searchParams.get('offset') || '0';
    const limit = searchParams.get('limit') || '50';

    const response = await fetch(
      `${BACKEND_URL}/api/swarm/messages/${id}?offset=${offset}&limit=${limit}`,
      {
        headers: {
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
      }
    );

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
    console.error('Swarm messages error:', error);
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : 'Failed to get swarm messages' },
      { status: 500 }
    );
  }
}
