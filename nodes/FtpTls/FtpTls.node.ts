import {
        IExecuteFunctions,
        INodeExecutionData,
        INodeType,
        INodeTypeDescription,
        NodeConnectionType,
        NodeOperationError,
} from 'n8n-workflow';

import { Client as BasicFtpClient } from 'basic-ftp';
import SftpClient from 'ssh2-sftp-client';
import * as path from 'path';
import { Writable } from 'stream';

export class FtpTls implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'FTP/FTPS with TLS',
		name: 'ftpTls',
		icon: 'fa:server',
		group: ['input', 'output'],
		version: 1,
		description: 'Transfer files via FTP/FTPS with TLS support',
		defaults: {
			name: 'FTP/FTPS with TLS',
		},
                inputs: [NodeConnectionType.Main],
                outputs: [NodeConnectionType.Main],
		credentials: [
			{
				name: 'ftpTls',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Delete',
						value: 'delete',
						description: 'Delete a file or folder',
						action: 'Delete a file or folder',
					},
					{
						name: 'Download',
						value: 'download',
						description: 'Download a file',
						action: 'Download a file',
					},
					{
						name: 'List',
						value: 'list',
						description: 'List contents of a folder',
						action: 'List contents of a folder',
					},
					{
						name: 'Rename',
						value: 'rename',
						description: 'Rename/move a file or folder',
						action: 'Rename a file or folder',
					},
					{
						name: 'Upload',
						value: 'upload',
						description: 'Upload a file',
						action: 'Upload a file',
					},
				],
				default: 'download',
			},
			{
				displayName: 'Path',
				name: 'path',
				type: 'string',
				default: '',
				placeholder: '/remote/path',
				description: 'The remote path to operate on',
			},
			{
				displayName: 'Recursive',
				name: 'recursive',
				type: 'boolean',
				displayOptions: {
					show: {
						operation: ['delete', 'list'],
					},
				},
				default: false,
				description: 'Whether to perform operation recursively',
			},
			{
				displayName: 'New Path',
				name: 'newPath',
				type: 'string',
				displayOptions: {
					show: {
						operation: ['rename'],
					},
				},
				default: '',
				description: 'The new path for rename operation',
			},
			{
				displayName: 'Binary File',
				name: 'binaryData',
				type: 'boolean',
				displayOptions: {
					show: {
						operation: ['upload'],
					},
				},
				default: false,
				description: 'Whether the file is binary',
			},
			{
				displayName: 'File Content',
				name: 'fileContent',
				type: 'string',
				displayOptions: {
					show: {
						operation: ['upload'],
						binaryData: [false],
					},
				},
				default: '',
				description: 'The content of the file to upload',
			},
			{
				displayName: 'Property Name',
				name: 'binaryPropertyName',
				type: 'string',
				displayOptions: {
					show: {
						operation: ['upload'],
						binaryData: [true],
					},
				},
				default: 'data',
				description: 'Name of the binary property containing the file data',
			},
			{
				displayName: 'Put Output File in Field',
				name: 'binaryPropertyName',
				type: 'string',
				displayOptions: {
					show: {
						operation: ['download'],
					},
				},
				default: 'data',
				description: 'Name of the binary property to put the file in',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const credentials = await this.getCredentials('ftpTls');
		const operation = this.getNodeParameter('operation', 0) as string;

                for (let i = 0; i < items.length; i++) {
                        try {
                                if (credentials.protocol === 'sftp') {
                                        const result = await (this as unknown as FtpTls).executeSftpOperation(this, i, credentials, operation);
                                        returnData.push(result);
                                } else {
                                        const result = await (this as unknown as FtpTls).executeFtpOperation(this, i, credentials, operation);
                                        returnData.push(result);
                                }
                        } catch (error: any) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: error.message,
						},
						pairedItem: {
							item: i,
						},
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}

        private async executeFtpOperation(
                context: IExecuteFunctions,
                itemIndex: number,
                credentials: any,
                operation: string,
        ): Promise<INodeExecutionData> {
		const client = new BasicFtpClient();
		client.ftp.verbose = false;

		try {
			// Configure TLS for FTPS
			if (credentials.protocol === 'ftps-explicit' || credentials.protocol === 'ftps-implicit') {
				const tlsOptions: any = {
					host: credentials.host,
					port: credentials.port,
					secure: credentials.protocol === 'ftps-implicit',
					secureOptions: credentials.security === 'legacy' ? {} : { secureProtocol: 'TLSv1_2_method' },
					rejectUnauthorized: !credentials.ignoreSSLIssues,
				};

				if (credentials.protocol === 'ftps-explicit') {
					await client.access({
						host: credentials.host,
						port: credentials.port || 21,
						user: credentials.username,
						password: credentials.password,
						secure: false,
						secureOptions: tlsOptions.secureOptions,
					});
					await client.ensureDir('/');
					await client.ftp.send('AUTH TLS');
				} else {
					await client.access({
						host: credentials.host,
						port: credentials.port || 990,
						user: credentials.username,
						password: credentials.password,
						secure: true,
						secureOptions: tlsOptions.secureOptions,
					});
				}
			} else {
				await client.access({
					host: credentials.host,
					port: credentials.port || 21,
					user: credentials.username,
					password: credentials.password,
				});
			}

                        const remotePath = context.getNodeParameter('path', itemIndex) as string;

			switch (operation) {
                                case 'list':
					const list = await client.list(remotePath);
					return {
						json: {
							files: list.map((file) => ({
								name: file.name,
								size: file.size,
								isDirectory: file.type === 2,
								modifiedAt: file.modifiedAt,
								permissions: file.permissions,
							})),
						},
						pairedItem: {
							item: itemIndex,
						},
					};

				case 'download':
                                        const binaryPropertyName = context.getNodeParameter('binaryPropertyName', itemIndex) as string;
                                        const chunks: Buffer[] = [];
                                        const writable = new Writable({
                                                write(chunk, _enc, cb) {
                                                        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
                                                        cb();
                                                },
                                        });
                                        await client.downloadTo(writable, remotePath);
                                        const buffer = Buffer.concat(chunks);
					
					return {
						json: {
							fileName: path.basename(remotePath),
							fileSize: buffer.length,
						},
						binary: {
							[binaryPropertyName]: {
								data: buffer.toString('base64'),
								mimeType: 'application/octet-stream',
								fileName: path.basename(remotePath),
							},
						},
						pairedItem: {
							item: itemIndex,
						},
					};

                                case 'upload':
                                        const binaryData = context.getNodeParameter('binaryData', itemIndex) as boolean;
                                        let uploadBuffer: Buffer;

                                        if (binaryData) {
                                                const binaryPropertyName = context.getNodeParameter('binaryPropertyName', itemIndex) as string;
                                                const binaryDataBuffer = await context.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
                                                uploadBuffer = binaryDataBuffer;
                                        } else {
                                                const fileContent = context.getNodeParameter('fileContent', itemIndex) as string;
                                                uploadBuffer = Buffer.from(fileContent);
                                        }

					await client.uploadFrom(uploadBuffer as any, remotePath);
					return {
						json: {
							success: true,
							path: remotePath,
						},
						pairedItem: {
							item: itemIndex,
						},
					};

                                case 'delete':
                                        const recursive_delete = context.getNodeParameter('recursive', itemIndex) as boolean;
					if (recursive_delete) {
						await client.removeDir(remotePath);
					} else {
						await client.remove(remotePath);
					}
					return {
						json: {
							success: true,
							path: remotePath,
						},
						pairedItem: {
							item: itemIndex,
						},
					};

                                case 'rename':
                                        const newPath = context.getNodeParameter('newPath', itemIndex) as string;
					await client.rename(remotePath, newPath);
					return {
						json: {
							success: true,
							oldPath: remotePath,
							newPath: newPath,
						},
						pairedItem: {
							item: itemIndex,
						},
					};

                                default:
                                        throw new NodeOperationError(context.getNode(), `Unknown operation: ${operation}`);
			}
		} finally {
			client.close();
		}
	}

        private async executeSftpOperation(
                context: IExecuteFunctions,
                itemIndex: number,
                credentials: any,
                operation: string,
        ): Promise<INodeExecutionData> {
		const client = new SftpClient();

		try {
			const connectOptions: any = {
				host: credentials.host,
				port: credentials.port || 22,
				username: credentials.username,
				password: credentials.password,
				readyTimeout: credentials.timeout || 10000,
			};

			if (credentials.privateKey) {
				connectOptions.privateKey = credentials.privateKey;
				if (credentials.passphrase) {
					connectOptions.passphrase = credentials.passphrase;
				}
			}

			await client.connect(connectOptions);

                        const remotePath = context.getNodeParameter('path', itemIndex) as string;

			switch (operation) {
				case 'list':
                                        const list = await client.list(remotePath);
                                        return {
                                                json: {
                                                        files: list.map((file: any) => ({
                                                                name: file.name,
                                                                size: file.size,
                                                                isDirectory: file.type === 'd',
                                                                modifiedAt: file.modifyTime,
                                                                permissions: file.rights,
							})),
						},
						pairedItem: {
							item: itemIndex,
						},
					};

                                case 'download':
                                        const binaryPropertyName = context.getNodeParameter('binaryPropertyName', itemIndex) as string;
                                        const buffer = await client.get(remotePath);
					
					return {
						json: {
							fileName: path.basename(remotePath),
							fileSize: buffer.length,
						},
						binary: {
							[binaryPropertyName]: {
								data: buffer.toString('base64'),
								mimeType: 'application/octet-stream',
								fileName: path.basename(remotePath),
							},
						},
						pairedItem: {
							item: itemIndex,
						},
					};

                                case 'upload':
                                        const binaryData = context.getNodeParameter('binaryData', itemIndex) as boolean;
					let uploadBuffer: Buffer;

					if (binaryData) {
                                                const binaryPropertyName = context.getNodeParameter('binaryPropertyName', itemIndex) as string;
                                                const binaryDataBuffer = await context.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
                                                uploadBuffer = binaryDataBuffer;
					} else {
                                                const fileContent = context.getNodeParameter('fileContent', itemIndex) as string;
						uploadBuffer = Buffer.from(fileContent);
					}

					await client.put(uploadBuffer, remotePath);
					return {
						json: {
							success: true,
							path: remotePath,
						},
						pairedItem: {
							item: itemIndex,
						},
					};

                                case 'delete':
                                        const recursive_delete = context.getNodeParameter('recursive', itemIndex) as boolean;
					if (recursive_delete) {
						await client.rmdir(remotePath, true);
					} else {
						await client.delete(remotePath);
					}
					return {
						json: {
							success: true,
							path: remotePath,
						},
						pairedItem: {
							item: itemIndex,
						},
					};

                                case 'rename':
                                        const newPath = context.getNodeParameter('newPath', itemIndex) as string;
					await client.rename(remotePath, newPath);
					return {
						json: {
							success: true,
							oldPath: remotePath,
							newPath: newPath,
						},
						pairedItem: {
							item: itemIndex,
						},
					};

                                default:
                                        throw new NodeOperationError(context.getNode(), `Unknown operation: ${operation}`);
			}
		} finally {
			await client.end();
		}
	}
}