import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Injectable } from '@nestjs/common'


const bucketText = 'avatars';

@Injectable()
export class MinioService {
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

	async uploadFile(key: string, file: Buffer, mimetype: string){
		const command = new PutObjectCommand({
			Bucket: bucketText,
			Key: key,
			Body: file,
			ContentType: mimetype
		})

		await this.client.send(command);
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