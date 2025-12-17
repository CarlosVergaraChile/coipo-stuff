import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import os from 'os';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const chunkIndex = formData.get('chunkIndex') as string;
    const uploadId = formData.get('uploadId') as string;

    if (!file || !chunkIndex || !uploadId) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // SANITIZACIÓN CRÍTICA
    const safeUploadId = uploadId.replace(/[^a-zA-Z0-9-_]/g, '');
    if (safeUploadId !== uploadId) return NextResponse.json({ error: 'Invalid uploadId' }, { status: 400 });

    const safeChunkIndex = chunkIndex.replace(/[^0-9]/g, '');
    if (safeChunkIndex !== chunkIndex) return NextResponse.json({ error: 'Invalid chunkIndex' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const tempDir = path.join(os.tmpdir(), 'uploads', safeUploadId);
    
    await mkdir(tempDir, { recursive: true });
    await writeFile(path.join(tempDir, `chunk_${safeChunkIndex}`), buffer);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error uploading chunk:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
