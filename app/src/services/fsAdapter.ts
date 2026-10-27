import RNFS from 'react-native-fs';
import type {FsPort} from './circuitFiles';

export const fsAdapter: FsPort = {
  documentDir: RNFS.DocumentDirectoryPath,
  exists: (p) => RNFS.exists(p),
  mkdir: (p) => RNFS.mkdir(p),
  unlink: (p) => RNFS.unlink(p),
  sha256: async (p) => (await RNFS.hash(p, 'sha256')).toLowerCase(),
  download: async (url, path) => {
    const result = await RNFS.downloadFile({fromUrl: url, toFile: path}).promise;
    return result.statusCode;
  },
};
