import makeDir from "make-dir";
import reqCall from "request";
import path from "path";
import fss from "fs";

import axios from "axios";
 

// export const dl = (fileName: string, url: string, onProgress: (percent: number) => void) => {
//     return axios.get(url, {
        
//     }).then(r => {
//         const out = fss.createWriteStream(fileName);

//         r.data.pipe(out);
//     });
// }

export const downloadFile = (fileName: string, url: string, onProgress: (percent: number) => void) => {
    return new Promise(async (resolve, reject) => {
        // Save variable to know progress
        let received_bytes = 0;
        let total_bytes = 0;

        const req = reqCall({
            method: 'GET',
            uri: url
        });

        await makeDir(path.dirname(fileName));
        const out = fss.createWriteStream(fileName);
        req.pipe(out);

        req.on('response', data => {
            // Change the total bytes value to get progress later.
            total_bytes = parseInt(data.headers['content-length']);
        });

        req.on('data', chunk => {
            // Update the received bytes
            received_bytes += chunk.length;
            onProgress(parseFloat(((received_bytes * 100) / total_bytes).toFixed(1)));
        });

        req.on('end', () => {
            resolve();
        });

        req.on('error', () => {
            reject();
        });
    });
};