export interface Key {
	success: boolean;
	message: string;
}

export interface DeviceCreate {
	success: boolean;
	deviceId: number;
	message: string;
}

export interface DeviceGet {
	success: number;
	deviceKey: string;
	message: string;
}