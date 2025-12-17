# Coipo Stuff - Chunked Upload API

## 📋 Overview

A production-ready, secure, and optimized Next.js API module for handling large file uploads using chunked transfer. Built with TypeScript and modern Next.js App Router patterns.

### Key Features

✅ **Security First**
- Input sanitization (3-level validation in upload-chunk)
- Path traversal prevention with `path.basename()`
- Secure temporary directory handling
- Emergency cleanup on errors

🚀 **Performance Optimized**
- WriteStream for memory-efficient assembly
- Configurable chunk limits (default: 1000 chunks = 5GB)
- Parallel chunk uploads supported
- Automatic temp file cleanup

🛡️ **Robust Error Handling**
- Try/finally/catch pattern for guaranteed cleanup
- Missing chunk detection
- Detailed error logging
- Graceful fallback on finalization errors

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/CarlosVergaraChile/coipo-stuff.git
cd coipo-stuff

# Install dependencies
npm install

# Create public uploads directory
mkdir -p public/uploads
```

### Environment Setup

No environment variables required for basic operation. The API uses `os.tmpdir()` and `process.cwd()` for paths.

## 📋 API Endpoints

### 1. Upload Chunk

**Endpoint:** `POST /api/upload-chunk`

**Purpose:** Receives individual file chunks

**Request:**
```json
Content-Type: multipart/form-data

Fields:
- file: Binary file chunk (required)
- uploadId: Unique upload session ID (required, alphanum + dash/underscore)
- chunkIndex: Chunk index number (required, numeric only)
```

**Response (Success):**
```json
{
  "success": true
}
```

**Response (Error):**
```json
{
  "error": "Missing fields" | "Invalid uploadId" | "Invalid chunkIndex" | "Upload failed"
}
```

**Validation Rules:**
- `file`: Must be valid File object from FormData
- `uploadId`: Only `[a-zA-Z0-9-_]` allowed
- `chunkIndex`: Only numeric values, must be valid positive integer

**Technical Details:**
- Chunks saved to: `${os.tmpdir()}/uploads/${uploadId}/chunk_${chunkIndex}`
- Uses `fs/promises.writeFile()` for async file writing
- Directory created recursively if not exists

---

### 2. Finalize Upload

**Endpoint:** `POST /api/finalize-upload`

**Purpose:** Assembles chunks into final file and performs cleanup

**Request:**
```json
Content-Type: application/json

{
  "uploadId": "string",           // Session ID from upload-chunk
  "fileName": "string",            // Original filename
  "totalChunks": number            // Total chunks to assemble (1-1000)
}
```

**Response (Success):**
```json
{
  "success": true,
  "path": "/uploads/filename.ext"
}
```

**Response (Error):**
```json
{
  "error": "Invalid totalChunks" | "Upload session not found" | "Assembly failed"
}
```

**Validation Rules:**
- `totalChunks`: Must be between 1 and 1000
- `uploadId`: Sanitized before use (same rules as upload-chunk)
- `fileName`: Only basename used (path traversal prevention)
- All chunks must exist before assembly

**Technical Details:**
- Assembly uses `fs.createWriteStream()` for memory efficiency
- Chunks read sequentially and streamed to final file
- Final file path: `${process.cwd()}/public/uploads/${safeFileName}`
- Temporary directory ALWAYS removed after completion (or error)

**Cleanup Guarantees:**
- `finally` block ensures cleanup attempt
- `try/catch` in finally prevents cleanup errors from hiding assembly errors
- Emergency cleanup on error with force flag

---

## 🚀 Configuration

```typescript
// In finalize-upload/route.ts
const MAX_CHUNKS = 1000; // Adjust based on your needs
// 5MB per chunk * 1000 = 5GB max file size
```

**Performance Recommendations:**

| Use Case | Chunk Size | Max Chunks | Max File Size |
|----------|-----------|-----------|---------------|
| Small files | 1MB | 1000 | 1GB |
| Medium files | 5MB | 1000 | 5GB |
| Large files | 10MB | 1000 | 10GB |
| Video uploads | 10MB-50MB | 1000 | 10-50GB |

---

## 📋 Client Implementation Example

```typescript
// Example frontend usage
async function uploadFile(file: File) {
  const uploadId = crypto.randomUUID();
  const chunkSize = 5 * 1024 * 1024; // 5MB
  const chunks = Math.ceil(file.size / chunkSize);

  // Upload chunks
  for (let i = 0; i < chunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);

    const formData = new FormData();
    formData.append('file', chunk);
    formData.append('chunkIndex', i.toString());
    formData.append('uploadId', uploadId);

    const response = await fetch('/api/upload-chunk', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) throw new Error('Chunk upload failed');
  }

  // Finalize
  const finalizeResponse = await fetch('/api/finalize-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uploadId,
      fileName: file.name,
      totalChunks: chunks
    })
  });

  const result = await finalizeResponse.json();
  console.log('File uploaded to:', result.path);
}
```

---

## 🛡️ Security Considerations

### Input Validation
- **uploadId**: Whitelist only `[a-zA-Z0-9-_]` to prevent injection
- **chunkIndex**: Numeric validation prevents directory traversal
- **fileName**: `path.basename()` removes any path components

### File System Security
- Temporary files in OS temp directory (isolated from project)
- Final uploads in `public/uploads` (configurable)
- No symbolic links followed
- File permissions respected (inherited from umask)

### Recommended Enhancements

```typescript
// TODO: Consider adding
- File type validation (whitelist MIME types)
- Virus scanning (ClamAV, VirusTotal)
- Rate limiting per uploadId
- Upload timeout handling (cleanup stale sessions)
- Audit logging of all uploads
- Encryption for sensitive files
```

---

## 📋 Monitoring & Debugging

### Logs
Enable debug logging:
```bash
DEBUG=coipo-stuff:* npm run dev
```

### Temporary Files
Check for orphaned temp files:
```bash
ls -la $(mktemp -d)/uploads/
```

### Common Issues

| Issue | Solution |
|-------|----------|
| "Upload session not found" | Ensure upload-chunk completed successfully |
| "Missing chunk X" | Re-upload failed chunks before finalize |
| "Invalid uploadId" | Use only alphanumeric, dash, underscore |
| "Invalid chunkIndex" | Use numeric indices starting from 0 |

---

## 📋 Production Deployment

### Environment Variables
```bash
# Optional overrides
UPLOAD_TEMP_DIR=/var/tmp/uploads    # Override temp directory
UPLOAD_FINAL_DIR=./public/uploads   # Override final directory
MAX_FILE_SIZE=5368709120            # 5GB in bytes
```

### Vercel Deployment
- Temp files: Use `/tmp` (read/write available)
- Final files: Use `/var/task/public` (requires write on buildtime)
- Recommendation: Use external storage (S3) for production

### Docker Deployment
```dockerfile
# Ensure write permissions
RUN mkdir -p /app/public/uploads && chmod 755 /app/public/uploads

# Nginx configuration to serve uploads
location /uploads/ {
    alias /app/public/uploads/;
    autoindex off;
}
```

---

## 📋 Testing

Run included test suite:
```bash
npm test
```

Test coverage:
- [✅] Valid chunk upload
- [✅] Invalid uploadId sanitization
- [✅] Invalid chunkIndex sanitization
- [✅] Missing chunk detection
- [✅] Chunk assembly
- [✅] Cleanup on success
- [✅] Cleanup on error

---

## 📋 API Reference

### Type Definitions
```typescript
// Request to upload-chunk
interface UploadChunkRequest {
  file: File;
  uploadId: string;      // Must match /^[a-zA-Z0-9-_]+$/
  chunkIndex: string;    // Must match /^[0-9]+$/
}

// Response from upload-chunk
interface UploadChunkResponse {
  success?: boolean;
  error?: string;
}

// Request to finalize-upload
interface FinalizeUploadRequest {
  uploadId: string;
  fileName: string;
  totalChunks: number;   // 1-1000
}

// Response from finalize-upload
interface FinalizeUploadResponse {
  success?: boolean;
  path?: string;         // /uploads/{sanitized-filename}
  error?: string;
}
```

---

## 📋 License

MIT License - See LICENSE file for details

## 📋 Support

For issues, questions, or contributions, please open an issue on GitHub.

**Maintainer:** Carlos Vergara Chile  
**Repository:** https://github.com/CarlosVergaraChile/coipo-stuff  
**Last Updated:** December 17, 2025
