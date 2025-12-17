import { NextRequest, NextResponse } from 'next/server';
import { readFile, rm, mkdir } from 'fs/promises';
import { createWriteStream, existsSync } from 'fs';
import path from 'path';
import os from 'os';

const MAX_CHUNKS = 1000; // Límite de seguridad

export async function POST(request: NextRequest) {
  let tempDir: string | null = null;
  try {
    const { uploadId, fileName, totalChunks } = await request.json();

    if (totalChunks > MAX_CHUNKS || totalChunks < 1) {
      return NextResponse.json({ error: 'Invalid totalChunks' }, { status: 400 });
    }

    const safeUploadId = uploadId.replace(/[^a-zA-Z0-9-_]/g, '');
    const safeFileName = path.basename(fileName);
    
    tempDir = path.join(os.tmpdir(), 'uploads', safeUploadId);
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    
    await mkdir(uploadsDir, { recursive: true });
    const finalFilePath = path.join(uploadsDir, safeFileName);

    if (!existsSync(tempDir)) {
      return NextResponse.json({ error: 'Upload session not found' }, { status: 404 });
    }

    // ENSAMBLAJE OPTIMIZADO (Streams)
    const writeStream = createWriteStream(finalFilePath);
    try {
      for (let i = 0; i < totalChunks; i++) {
        const chunkPath = path.join(tempDir, `chunk_${i}`);
        if (!existsSync(chunkPath)) throw new Error(`Missing chunk ${i}`);
        
        const chunkData = await readFile(chunkPath);
        writeStream.write(chunkData);
      }
      
      await new Promise((resolve, reject) => {
        writeStream.end();
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });
    } finally {
      writeStream.destroy();
      // GARANTÍA DE LIMPIEZA
      if (tempDir) await rm(tempDir, { recursive: true, force: true });
    }
    
    return NextResponse.json({ success: true, path: `/uploads/${safeFileName}` });

  } catch (error) {
    console.error('Finalization error:', error);
    if (tempDir) await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    return NextResponse.json({ error: 'Assembly failed' }, { status: 500 });
  }
}
