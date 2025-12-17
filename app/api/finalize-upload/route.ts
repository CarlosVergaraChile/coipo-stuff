import { NextRequest, NextResponse } from 'next/server';
import { readFile, rm, mkdir } from 'fs/promises';
import { createWriteStream, existsSync } from 'fs';
import path from 'path';
import os from 'os';

const MAX_CHUNKS = 1000; // Máximo 5GB (5MB * 1000)

export async function POST(request: NextRequest) {
  let tempDir: string | null = null;
  
  try {
    const { uploadId, fileName, totalChunks } = await request.json();

    // VALIDACIÓN 1: totalChunks
    if (totalChunks > MAX_CHUNKS || totalChunks < 1) {
      return NextResponse.json({ error: 'Invalid totalChunks' }, { status: 400 });
    }

    // VALIDACIÓN 2: Sanitización
    const safeUploadId = uploadId.replace(/[^a-zA-Z0-9-_]/g, '');
    const safeFileName = path.basename(fileName);
    
    tempDir = path.join(os.tmpdir(), 'uploads', safeUploadId);
    
    // Asegurar directorio destino
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    await mkdir(uploadsDir, { recursive: true });
    const finalFilePath = path.join(uploadsDir, safeFileName);

    if (!existsSync(tempDir)) {
      return NextResponse.json({ error: 'Upload session not found' }, { status: 404 });
    }

    // Optimización: Usar WriteStream
    const writeStream = createWriteStream(finalFilePath);

    try {
      for (let i = 0; i < totalChunks; i++) {
        const chunkPath = path.join(tempDir, `chunk_${i}`);
        
        if (!existsSync(chunkPath)) {
          throw new Error(`Missing chunk ${i}`);
        }

        const chunkData = await readFile(chunkPath);
        writeStream.write(chunkData);
      }

      // Esperar a que termine de escribir
      await new Promise((resolve, reject) => {
        writeStream.end();
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });
    } finally {
      writeStream.destroy();
      
      // Limpieza garantizada
      if (tempDir) {
        try {
          await rm(tempDir, { recursive: true, force: true });
        } catch (cleanupError) {
          console.error('CRITICAL: Failed to cleanup chunks:', cleanupError);
        }
      }
    }

    // Opcional: Trigger n8n u otros webhooks aquí si es necesario
    
    return NextResponse.json({ 
      success: true, 
      path: `/uploads/${safeFileName}` 
    });

  } catch (error) {
    console.error('Finalization error:', error);
    
    // Limpieza de emergencia
    if (tempDir) {
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch (e) { 
        console.error('Emergency cleanup failed:', e);
      }
    }

    return NextResponse.json({ error: 'Assembly failed' }, { status: 500 });
  }
}
