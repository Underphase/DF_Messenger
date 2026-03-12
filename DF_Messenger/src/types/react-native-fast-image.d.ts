declare module 'react-native-fast-image' {
  import { ImageProps } from 'react-native';

  export enum priority {
    low = 'low',
    normal = 'normal',
    high = 'high',
  }

  export enum cacheControl {
    immutable = 'immutable',
    web = 'web',
    cacheOnly = 'cacheOnly',
  }

  export enum resizeMode {
    contain = 'contain',
    cover = 'cover',
    stretch = 'stretch',
    center = 'center',
  }

  export interface FastImageSource {
    uri?: string;
    headers?: { [key: string]: string };
    priority?: priority;
    cache?: cacheControl;
  }

  export interface FastImageProps extends ImageProps {
    source: FastImageSource | number;
    resizeMode?: resizeMode;
    priority?: priority;
    cache?: cacheControl;
    onLoad?: (e: any) => void;
    onError?: (e: any) => void;
    onLoadStart?: () => void;
    onLoadEnd?: () => void;
  }

  const FastImage: React.ComponentType<FastImageProps> & {
    priority: typeof priority;
    cacheControl: typeof cacheControl;
    resizeMode: typeof resizeMode;
    preload: (sources: FastImageSource[]) => void;
  };

  export default FastImage;
}