/**
 * node index.js http://localhost:9094/api fingerprint.scanner.1 Xbdxndsma%
 */
//// Core modules
const { watchFile } = require('fs')
const path = require('path')
const process = require('process')
const { readFileSync } = require('fs')

//// External modules
const lodashGroupBy = require('lodash.groupby')
const moment = require('moment')

//// Modules

global.APP_DIR = path.resolve(__dirname).replace(/\\/g, '/'); // Turn back slash to slash for cross-platform compat




(async () => {
    try {
        [url, ...rest] = process.argv.slice(2)
        // console.log(url, rest)

        const fileName = `biometric-scans.txt`

        const cronJob = async () => {
            try {
                let date = moment().format(`YYYY-MM-DD hh:mm A`)
                // console.log(`${date}: Task started..`)

                let file = readFileSync(`${APP_DIR}/${fileName}`)
                // getHash(file)

                file = file.toString('utf-8')
                let rows = file.split("\n")?.map(r => {
                    return r.split(", ")?.map(c => c?.trim())
                })

                rows.sort(function (a, b) {
                    let dateTimeA = moment(`${a[1]} ${a[2]}`, 'YYYY-MM-DD hh:mm:ss A', true)
                    let dateTimeB = moment(`${b[1]} ${b[2]}`, 'YYYY-MM-DD hh:mm:ss A', true)
                    if (dateTimeA.isBefore(dateTimeB)) {
                        return -1;
                    }
                    if (dateTimeA.isAfter(dateTimeB)) {
                        return 1;
                    }
                    return 0;
                });

                rows = lodashGroupBy(rows, (row) => row[1])
                // console.log(rows)

                let postData = {
                    username: rest[0],
                    password: rest[1]
                }
                let response = await fetch(`${url}/login`, {
                    method: 'POST',
                    body: JSON.stringify(postData),
                    headers: {
                        'Content-Type': 'application/json',
                    }
                })
                if (!response.ok) {
                    throw new Error(await response.text())
                }
                let jwt = await response.text()

                response = await fetch(`${url}/app/biometric/scans`, {
                    method: 'POST',
                    body: JSON.stringify(rows),
                    headers: {
                        'Authorization': `Bearer ${jwt}`,
                        'Content-Type': 'application/json',
                    }
                })
                if (!response.ok) {
                    throw new Error(await response.text())
                }
                console.log(await response.text())
            } catch (err) {
                console.error(err)
            }

        }
        await cronJob()
        console.log(`Watching file ${fileName}...`)

        watchFile(`${APP_DIR}/${fileName}`, async (curr, prev) => {
            if (curr.mtimeMs > prev.mtimeMs && curr.size !== prev.size) {
                console.log(`File changed...`)
                await cronJob()
            }
        });
    } catch (err) {
        console.error(err)
    }
})()