export interface register {
	message: string,
	expiresIn: number
}

export interface login {
	message: string,
	expiresIn: number
}

export interface verify {
	message: string,
	accessToken: string,
	refreshToken: string
}

export interface sendCode {
	message: string,
	expiresIn: number
}