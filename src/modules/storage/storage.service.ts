import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

/**
 * AWS S3 presigned URL generation — bağımlılıksız (AWS SDK olmadan).
 * Muzayede s3-presign.service.ts referansından uyarlanmış.
 */
@Injectable()
export class StorageService {
  private readonly region: string;
  private readonly bucket: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;

  constructor(private config: ConfigService) {
    this.region = config.get('AWS_REGION', 'eu-central-1');
    this.bucket = config.get('S3_BUCKET', 'xting-story-assets');
    this.accessKeyId = config.get('AWS_ACCESS_KEY_ID', '');
    this.secretAccessKey = config.get('AWS_SECRET_ACCESS_KEY', '');
  }

  async presignPutObject(key: string, contentType: string, expiresIn = 900): Promise<{
    uploadUrl: string;
    publicUrl: string;
  }> {
    const now = new Date();
    const dateStamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 8);
    const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const credential = `${this.accessKeyId}/${dateStamp}/${this.region}/s3/aws4_request`;
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');

    const queryParams = [
      `X-Amz-Algorithm=AWS4-HMAC-SHA256`,
      `X-Amz-Credential=${encodeURIComponent(credential)}`,
      `X-Amz-Date=${amzDate}`,
      `X-Amz-Expires=${expiresIn}`,
      `X-Amz-SignedHeaders=content-type%3Bhost`,
    ].sort().join('&');

    const host = `${this.bucket}.s3.${this.region}.amazonaws.com`;
    const canonicalRequest = [
      'PUT',
      `/${encodedKey}`,
      queryParams,
      `content-type:${contentType}`,
      `host:${host}`,
      '',
      'content-type;host',
      'UNSIGNED-PAYLOAD',
    ].join('\n');

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      `${dateStamp}/${this.region}/s3/aws4_request`,
      this.sha256(canonicalRequest),
    ].join('\n');

    const signingKey = this.getSignatureKey(dateStamp);
    const signature = this.hmac(signingKey, stringToSign).toString('hex');

    const uploadUrl = `https://${host}/${encodedKey}?${queryParams}&X-Amz-Signature=${signature}`;
    const publicUrl = `https://${host}/${encodedKey}`;

    return { uploadUrl, publicUrl };
  }

  getPublicUrl(key: string): string {
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${encodedKey}`;
  }

  private sha256(data: string): string {
    return createHmac('sha256', '').update(data).digest('hex');
  }

  private hmac(key: Buffer | string, data: string): Buffer {
    return createHmac('sha256', key).update(data).digest();
  }

  private getSignatureKey(dateStamp: string): Buffer {
    const kDate = this.hmac(`AWS4${this.secretAccessKey}`, dateStamp);
    const kRegion = this.hmac(kDate, this.region);
    const kService = this.hmac(kRegion, 's3');
    return this.hmac(kService, 'aws4_request');
  }
}
