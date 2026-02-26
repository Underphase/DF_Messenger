import { useMutation, useQuery } from '@tanstack/react-query'
import { keys } from '../api'

export const useVerifyKey = () => {
	return useMutation({
		mutationFn: keys.verify,
		onSuccess: (data) => {
			console.log('Ключ подтвержден: ', data)
		},
		onError: (err) => {
			console.error('Ошиба подтверждения ключа: ', err)
		},
	});
};

export const useCreateDevice = () => {
  return useMutation({
    mutationFn: keys.createDevice,
  });
};

export const useGetDevice = (deviceId: number) => {
  return useQuery({
    queryKey: ['device', deviceId],
    queryFn: () => keys.getDevice(deviceId),
    enabled: !!deviceId
  });
};