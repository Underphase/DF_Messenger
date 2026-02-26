import { useMutation } from '@tanstack/react-query'
import { loginApi } from '../api'

export const useRegister = () => {
  return useMutation({
    mutationFn: ({ email, nickName, password }: { email: string; nickName: string; password: string }) => {
      return loginApi.register(email, nickName, password)
    }
  })
}

export const useLogin = () => {
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => {
      return loginApi.login(email, password)
    }
  })
}

export const useVerify = () => {
  return useMutation({
    mutationFn: ({ email, code }: { email: string; code: string }) => {
      return loginApi.verify(email, code)
    }
  })
}

export const useSendCode = () => {
  return useMutation({
    mutationFn: ({ email }: { email: string }) => {
      return loginApi.sendCode(email)
    }
  })
}