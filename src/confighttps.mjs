import { readFileSync } from 'fs'
import { join } from 'desm'

const configSecServ = async (certDir='../config') => {
  const readCertFile = (filename) => {
    return readFileSync(join(import.meta.url, certDir, filename))
  };
  try {
    const [key, cert] = await Promise.all(
      [readCertFile('privkey.pem'), readCertFile('fullchain.pem')]);
    return {key, cert, allowHTTP1: true};
  } catch (err) {
    console.log('Error: certifite failed. ' + err);
    process.exit(1);
  }
}
export default configSecServ
