// Cloudflare R2 Storage Service for Video Hosting
// Uses S3-compatible API with zero egress fees

import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand, 
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListObjectsV2Command,
  PutBucketCorsCommand,
  GetBucketCorsCommand
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "rampage-films";

function isR2Configured(): boolean {
  return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);
}

let r2Client: S3Client | null = null;

function getR2Client(): S3Client {
  if (!r2Client) {
    if (!isR2Configured()) {
      throw new Error("R2 credentials not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY");
    }
    
    r2Client = new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID!,
        secretAccessKey: R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return r2Client;
}

export class R2StorageService {
  private bucketName: string;

  constructor() {
    this.bucketName = R2_BUCKET_NAME;
  }

  isConfigured(): boolean {
    return isR2Configured();
  }

  getBucketName(): string {
    return this.bucketName;
  }

  async uploadVideoFromFile(
    filePath: string, 
    fileName: string,
    onProgress?: (percent: number, uploaded: number, total: number | null, speed: number, eta: number | null) => void
  ): Promise<string> {
    const fileStats = await fs.promises.stat(filePath);
    const fileSizeMB = fileStats.size / (1024 * 1024);
    
    // Use multipart upload for files > 100MB (R2 single-part limit is 5GB but we play it safe)
    // and to avoid memory issues with large files
    const MULTIPART_THRESHOLD = 100 * 1024 * 1024; // 100MB
    
    if (fileStats.size > MULTIPART_THRESHOLD) {
      console.log(`[R2] File size ${fileSizeMB.toFixed(2)} MB exceeds ${MULTIPART_THRESHOLD / (1024*1024)}MB threshold, using multipart upload`);
      const readStream = fs.createReadStream(filePath);
      return this.uploadVideoMultipart(readStream, fileName, fileStats.size, onProgress);
    }
    
    // Small files: use simple PUT (report progress as 0% -> 100%)
    const client = getR2Client();
    const objectKey = `videos/${fileName}.mp4`;
    
    const fileStream = fs.createReadStream(filePath);
    
    // Report start
    if (onProgress) {
      onProgress(0, 0, fileStats.size, 0, null);
    }
    
    const uploadStart = Date.now();
    
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: objectKey,
      Body: fileStream,
      ContentType: "video/mp4",
      ContentLength: fileStats.size,
    });

    await client.send(command);
    console.log(`[R2] Uploaded video to ${objectKey} (${fileSizeMB.toFixed(2)} MB)`);
    
    // Report completion
    if (onProgress) {
      const elapsedMs = Date.now() - uploadStart;
      const speed = elapsedMs > 0 ? (fileStats.size / elapsedMs) * 1000 : 0;
      onProgress(100, fileStats.size, fileStats.size, speed, 0);
    }
    
    return objectKey;
  }

  async uploadVideoFromBuffer(buffer: Buffer, fileName: string): Promise<string> {
    const client = getR2Client();
    const objectKey = `videos/${fileName}.mp4`;
    
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: objectKey,
      Body: buffer,
      ContentType: "video/mp4",
      ContentLength: buffer.length,
    });

    await client.send(command);
    console.log(`[R2] Uploaded video buffer to ${objectKey} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
    
    return objectKey;
  }

  async uploadVideoFromStream(
    readStream: NodeJS.ReadableStream,
    fileName: string,
    contentLength?: number
  ): Promise<string> {
    const client = getR2Client();
    const objectKey = `videos/${fileName}.mp4`;

    const chunks: Buffer[] = [];
    for await (const chunk of readStream) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: objectKey,
      Body: buffer,
      ContentType: "video/mp4",
      ContentLength: buffer.length,
    });

    await client.send(command);
    console.log(`[R2] Uploaded video stream to ${objectKey} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
    
    return objectKey;
  }

  async uploadAudioFromBuffer(buffer: Buffer, fileName: string): Promise<string> {
    const client = getR2Client();
    const objectKey = `audio/${fileName}.mp3`;
    
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: objectKey,
      Body: buffer,
      ContentType: "audio/mpeg",
      ContentLength: buffer.length,
    });

    await client.send(command);
    console.log(`[R2] Uploaded audio to ${objectKey} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
    
    return objectKey;
  }

  async uploadAudioFromFile(filePath: string, fileName: string): Promise<string> {
    const client = getR2Client();
    const objectKey = `audio/${fileName}.mp3`;
    
    const fileBuffer = await fs.promises.readFile(filePath);
    const fileSizeMB = fileBuffer.length / (1024 * 1024);
    
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: objectKey,
      Body: fileBuffer,
      ContentType: "audio/mpeg",
      ContentLength: fileBuffer.length,
    });

    await client.send(command);
    console.log(`[R2] Uploaded audio file to ${objectKey} (${fileSizeMB.toFixed(2)} MB)`);
    
    return objectKey;
  }

  // Progress callback type for upload tracking
  // percent: 0-100, uploaded: bytes uploaded, total: total bytes (if known), speed: bytes/sec, eta: seconds remaining
  
  // Multipart upload for large files - streams data in chunks to avoid memory issues
  async uploadVideoMultipart(
    readStream: NodeJS.ReadableStream,
    fileName: string,
    totalSize?: number,
    onProgress?: (percent: number, uploaded: number, total: number | null, speed: number, eta: number | null) => void
  ): Promise<string> {
    const client = getR2Client();
    const objectKey = `videos/${fileName}.mp4`;
    const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks (minimum for S3 multipart is 5MB)
    
    console.log(`[R2] Starting multipart upload for ${objectKey}${totalSize ? ` (${(totalSize / 1024 / 1024).toFixed(2)} MB)` : ''}`);
    
    // Start multipart upload
    const createCommand = new CreateMultipartUploadCommand({
      Bucket: this.bucketName,
      Key: objectKey,
      ContentType: "video/mp4",
    });
    
    const { UploadId } = await client.send(createCommand);
    if (!UploadId) {
      throw new Error("Failed to initiate multipart upload");
    }
    
    console.log(`[R2] Multipart upload initiated: ${UploadId}`);
    
    const uploadedParts: { ETag: string; PartNumber: number }[] = [];
    let partNumber = 1;
    let buffer = Buffer.alloc(0);
    let totalUploaded = 0;
    
    // Track upload speed and ETA
    const uploadStartTime = Date.now();
    let lastProgressUpdate = 0;
    
    const reportProgress = () => {
      if (!onProgress) return;
      
      const elapsedMs = Date.now() - uploadStartTime;
      const speed = elapsedMs > 0 ? (totalUploaded / elapsedMs) * 1000 : 0; // bytes per second
      const percent = totalSize ? (totalUploaded / totalSize) * 100 : 0;
      const remainingBytes = totalSize ? totalSize - totalUploaded : null;
      const eta = (remainingBytes !== null && speed > 0) ? Math.ceil(remainingBytes / speed) : null;
      
      // Only update every 2% or 2 seconds to avoid spam
      const now = Date.now();
      if (now - lastProgressUpdate > 2000 || percent - lastProgressUpdate > 2) {
        lastProgressUpdate = now;
        onProgress(percent, totalUploaded, totalSize || null, speed, eta);
      }
    };
    
    try {
      for await (const chunk of readStream) {
        buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
        
        // Upload when we have enough data
        while (buffer.length >= CHUNK_SIZE) {
          const partData = buffer.subarray(0, CHUNK_SIZE);
          buffer = buffer.subarray(CHUNK_SIZE);
          
          const uploadPartCommand = new UploadPartCommand({
            Bucket: this.bucketName,
            Key: objectKey,
            UploadId,
            PartNumber: partNumber,
            Body: partData,
          });
          
          const { ETag } = await client.send(uploadPartCommand);
          if (ETag) {
            uploadedParts.push({ ETag, PartNumber: partNumber });
          }
          
          totalUploaded += partData.length;
          console.log(`[R2] Uploaded part ${partNumber} (${(partData.length / 1024 / 1024).toFixed(2)} MB) - Total: ${(totalUploaded / 1024 / 1024).toFixed(2)} MB`);
          reportProgress();
          partNumber++;
        }
      }
      
      // Upload remaining data
      if (buffer.length > 0) {
        const uploadPartCommand = new UploadPartCommand({
          Bucket: this.bucketName,
          Key: objectKey,
          UploadId,
          PartNumber: partNumber,
          Body: buffer,
        });
        
        const { ETag } = await client.send(uploadPartCommand);
        if (ETag) {
          uploadedParts.push({ ETag, PartNumber: partNumber });
        }
        
        totalUploaded += buffer.length;
        console.log(`[R2] Uploaded final part ${partNumber} (${(buffer.length / 1024 / 1024).toFixed(2)} MB) - Total: ${(totalUploaded / 1024 / 1024).toFixed(2)} MB`);
        reportProgress();
      }
      
      // Complete multipart upload
      const completeCommand = new CompleteMultipartUploadCommand({
        Bucket: this.bucketName,
        Key: objectKey,
        UploadId,
        MultipartUpload: {
          Parts: uploadedParts.sort((a, b) => a.PartNumber - b.PartNumber),
        },
      });
      
      await client.send(completeCommand);
      console.log(`[R2] Multipart upload completed: ${objectKey} (${(totalUploaded / 1024 / 1024).toFixed(2)} MB)`);
      
      // Final progress report at 100%
      if (onProgress) {
        const elapsedMs = Date.now() - uploadStartTime;
        const avgSpeed = elapsedMs > 0 ? (totalUploaded / elapsedMs) * 1000 : 0;
        onProgress(100, totalUploaded, totalSize || totalUploaded, avgSpeed, 0);
      }
      
      return objectKey;
    } catch (error) {
      // Abort the multipart upload on error
      console.error(`[R2] Error during multipart upload, aborting: ${error}`);
      try {
        const abortCommand = new AbortMultipartUploadCommand({
          Bucket: this.bucketName,
          Key: objectKey,
          UploadId,
        });
        await client.send(abortCommand);
        console.log(`[R2] Multipart upload aborted: ${UploadId}`);
      } catch (abortError) {
        console.error(`[R2] Failed to abort multipart upload: ${abortError}`);
      }
      throw error;
    }
  }

  async getSignedUrl(objectKey: string, expiresIn: number = 86400): Promise<string> {
    const client = getR2Client();
    
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: objectKey,
    });

    const signedUrl = await getSignedUrl(client, command, { expiresIn });
    return signedUrl;
  }

  async getSignedDownloadUrl(objectKey: string, filename: string, expiresIn: number = 3600): Promise<string> {
    const client = getR2Client();
    
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: objectKey,
      ResponseContentDisposition: `attachment; filename="${filename}"`,
    });

    const signedUrl = await getSignedUrl(client, command, { expiresIn });
    return signedUrl;
  }

  async getPublicUrl(objectKey: string): Promise<string> {
    return this.getSignedUrl(objectKey, 86400);
  }

  async deleteObject(objectKey: string): Promise<void> {
    const client = getR2Client();
    
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: objectKey,
    });

    await client.send(command);
    console.log(`[R2] Deleted object: ${objectKey}`);
  }

  // ============ CHECKPOINT METHODS ============
  // These are used for job resumption - stores intermediate artifacts in isolated namespace
  
  async uploadCheckpoint(jobId: string, fileName: string, filePath: string): Promise<string> {
    const client = getR2Client();
    const key = `_checkpoints/${jobId}/${fileName}`;
    
    const fileBuffer = await fs.promises.readFile(filePath);
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: fileBuffer,
      ContentType: 'application/octet-stream',
    });
    
    await client.send(command);
    console.log(`[R2] Uploaded checkpoint: ${key}`);
    return key;
  }
  
  async downloadCheckpoint(key: string, localPath: string): Promise<boolean> {
    try {
      const client = getR2Client();
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      
      const response = await client.send(command);
      if (!response.Body) return false;
      
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as any) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      await fs.promises.writeFile(localPath, buffer);
      console.log(`[R2] Downloaded checkpoint: ${key}`);
      return true;
    } catch (error: any) {
      console.error(`[R2] Failed to download checkpoint: ${error.message}`);
      return false;
    }
  }
  
  async deleteCheckpoint(key: string): Promise<void> {
    if (!key.startsWith('_checkpoints/')) {
      console.warn(`[R2] Skipping delete - not a checkpoint key: ${key}`);
      return;
    }
    await this.deleteObject(key);
  }
  
  async cleanupJobCheckpoints(jobId: string): Promise<void> {
    const client = getR2Client();
    const prefix = `_checkpoints/${jobId}/`;
    
    try {
      const listCommand = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
      });
      
      const response = await client.send(listCommand);
      const objects = response.Contents || [];
      
      for (const obj of objects) {
        if (obj.Key) {
          await this.deleteObject(obj.Key);
        }
      }
      console.log(`[R2] Cleaned up ${objects.length} checkpoint files for job ${jobId}`);
    } catch (error: any) {
      console.warn(`[R2] Checkpoint cleanup failed: ${error.message}`);
    }
  }
  
  // ============ END CHECKPOINT METHODS ============

  async objectExists(objectKey: string): Promise<boolean> {
    const client = getR2Client();
    
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: objectKey,
      });
      await client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  async getObjectMetadata(objectKey: string): Promise<{ size: number; contentType: string } | null> {
    const client = getR2Client();
    
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: objectKey,
      });
      const response = await client.send(command);
      return {
        size: response.ContentLength || 0,
        contentType: response.ContentType || "application/octet-stream",
      };
    } catch (error: any) {
      if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  async configureCORS(): Promise<void> {
    const client = getR2Client();
    
    const corsConfig = {
      CORSRules: [{
        AllowedOrigins: ["*"],
        AllowedMethods: ["GET", "HEAD", "PUT"],
        AllowedHeaders: ["Content-Type", "Content-Length", "Range", "Accept-Ranges"],
        ExposeHeaders: ["Content-Length", "Content-Type", "Accept-Ranges", "Content-Range", "ETag"],
        MaxAgeSeconds: 86400
      }]
    };

    const command = new PutBucketCorsCommand({
      Bucket: this.bucketName,
      CORSConfiguration: corsConfig
    });

    await client.send(command);
    console.log(`[R2] CORS configured for bucket ${this.bucketName}`);
  }

  async streamObject(objectKey: string): Promise<{ stream: NodeJS.ReadableStream; contentLength: number; contentType: string } | null> {
    const client = getR2Client();
    
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: objectKey,
      });
      
      const response = await client.send(command);
      
      if (!response.Body) {
        return null;
      }
      
      return {
        stream: response.Body as NodeJS.ReadableStream,
        contentLength: response.ContentLength || 0,
        contentType: response.ContentType || "video/mp4"
      };
    } catch (error: any) {
      console.error(`[R2] Error streaming object ${objectKey}:`, error.message);
      return null;
    }
  }

  async streamObjectRange(objectKey: string, start: number, end: number): Promise<{ stream: NodeJS.ReadableStream; contentLength: number; contentType: string; contentRange: string; totalSize: number } | null> {
    const client = getR2Client();
    
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: objectKey,
        Range: `bytes=${start}-${end}`
      });
      
      const response = await client.send(command);
      
      if (!response.Body) {
        return null;
      }
      
      const totalSize = response.ContentRange ? parseInt(response.ContentRange.split('/')[1]) : (response.ContentLength || 0);
      
      return {
        stream: response.Body as NodeJS.ReadableStream,
        contentLength: response.ContentLength || (end - start + 1),
        contentType: response.ContentType || "video/mp4",
        contentRange: response.ContentRange || `bytes ${start}-${end}/${totalSize}`,
        totalSize
      };
    } catch (error: any) {
      console.error(`[R2] Error streaming object range ${objectKey}:`, error.message);
      return null;
    }
  }

  async listAllObjects(prefix?: string): Promise<Array<{ key: string; size: number; lastModified: Date | undefined }>> {
    const client = getR2Client();
    const allObjects: Array<{ key: string; size: number; lastModified: Date | undefined }> = [];
    let continuationToken: string | undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      });

      const response = await client.send(command);
      
      if (response.Contents) {
        for (const obj of response.Contents) {
          if (obj.Key) {
            allObjects.push({
              key: obj.Key,
              size: obj.Size || 0,
              lastModified: obj.LastModified,
            });
          }
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    console.log(`[R2] Listed ${allObjects.length} objects${prefix ? ` with prefix "${prefix}"` : ''}`);
    return allObjects;
  }
}

export const r2StorageService = new R2StorageService();
