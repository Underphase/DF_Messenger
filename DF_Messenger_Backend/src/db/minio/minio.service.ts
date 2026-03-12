import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutBucketPolicyCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Injectable, OnModuleInit } from '@nestjs/common'
import ffmpeg from 'fluent-ffmpeg'
import { Readable } from 'stream'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import sharp from 'sharp'

const bucketText = 'avatars';

@Injectable()
export class MinioService implements OnModuleInit {
	private client: S3Client;

	constructor() {
		this.client = new S3Client({
			region: 'us-east-1',
			endpoint: process.env.MINIO_ENDPOINT!,
			credentials: {
				accessKeyId: process.env.MINIO_ACCESS_KEY!,
				secretAccessKey: process.env.MINIO_SECRET_ACCESS_KEY!
			},
			forcePathStyle: true
		});
	}

	async onModuleInit() {
    await this.ensurePublicBucket('avatars')
    await this.ensurePublicBucket('banners')
	}

	  private async ensurePublicBucket(bucket: string) {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: bucket }))
    } catch {
      await this.client.send(new HeadBucketCommand({ Bucket: bucket }))
    }

    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${bucket}/*`]
        }
      ]
    }

    await this.client.send(new PutBucketPolicyCommand({
      Bucket: bucket,
      Policy: JSON.stringify(policy)
    }))
  }

	async cropImage(
  fileBuffer: Buffer,
  x: number,
  y: number,
  width: number,
  height: number
	): Promise<Buffer> {
		return sharp(fileBuffer)
			.extract({ left: x, top: y, width, height })
			.toBuffer()
	}

	async cropGif(
		fileBuffer: Buffer,
		x: number,
		y: number,
		width: number,
		height: number
	): Promise<Buffer> {
		const tmpDir = os.tmpdir()
		const inputPath = path.join(tmpDir, `input_${Date.now()}.gif`)
		const outputPath = path.join(tmpDir, `output_${Date.now()}.gif`)

		fs.writeFileSync(inputPath, fileBuffer)

		await new Promise<void>((resolve, reject) => {
			ffmpeg(inputPath)
				.videoFilters(`crop=${width}:${height}:${x}:${y}`)
				.output(outputPath)
				.on('end', () => resolve())
				.on('error', (err) => reject(err))
				.run()
		})

		const result = fs.readFileSync(outputPath)
		fs.unlinkSync(inputPath)
		fs.unlinkSync(outputPath)

		return result
	}

	async uploadFile(bucket: string, key: string, file: Buffer, mimetype: string) {
		const command = new PutObjectCommand({
			Bucket: bucket,
			Key: key,
			Body: file,
			ContentType: mimetype
		})
		await this.client.send(command)
	}

	async getFile(key: string) {
		const command = new GetObjectCommand({
			Bucket: bucketText,
			Key: key
		});
		const response = await this.client.send(command);
		return response.Body;
	}

	async deleteFile(bucket: string, key: string) {
		const command = new DeleteObjectCommand({
			Bucket: bucket,
			Key: key
		});

		await this.client.send(command);
	}

	async getUploadUrl(bucket: string, key: string, expiresIn = 900) {
		const command = new PutObjectCommand({
			Bucket: bucket,
			Key: key
		})
		return getSignedUrl(this.client, command, { expiresIn });
	}

	async getDownloadUrl(bucket: string, key: string, expiresIn = 3600) {
		const command = new GetObjectCommand({
			Bucket: bucket,
			Key: key
		});
		return getSignedUrl(this.client, command, {expiresIn});
	}

	async checkExists(bucket: string, key: string): Promise<boolean> {
		try{
			const command = new HeadObjectCommand({
				Bucket: bucket,
				Key: key
			});
			await this.client.send(command);
			return true;
		}catch(err: any){
			if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
				return false
			}
			throw err;
		}
	}

	async getPresignedUrl(key: string){
    const command = new GetObjectCommand({
      Bucket: bucketText,
      Key: key
    })
    const url = await getSignedUrl(this.client, command, {expiresIn: 60})
    return url;
  }

}