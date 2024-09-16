/**
 * node index.js http://localhost:9094/api fingerprint.scanner.1 pword
 * node index.js http://localhost:9094/api fingerprint.scanner.1 pword 2024-09-13
 */
//// Core modules
const { watchFile, writeFileSync, readFileSync, existsSync } = require('fs')
const path = require('path')
const process = require('process')

//// External modules
const lodashGroupBy = require('lodash.groupby')
const moment = require('moment')
const { Sequelize } = require('sequelize')

//// Modules

global.APP_DIR = path.resolve(__dirname).replace(/\\/g, '/'); // Turn back slash to slash for cross-platform compat




(async () => {
    try {
        [url, ...rest] = process.argv.slice(2)

        const DATE_TO_PROCESS = (rest.at(2)) ? moment(rest.at(2)) : moment()

        // console.log(url, rest)

        const sequelize = new Sequelize({
            dialect: 'sqlite',
            storage: `${APP_DIR}/logs.db`,
            logging: false,
        });
        await sequelize.authenticate()
        const Log = require(`${APP_DIR}/models/log`)('Log', sequelize)

        await Log.sync() // This creates the table if it doesn't exist (and does nothing if it already exists)

        // console.log(`${moment().format('MMM-DD-YYYY hh:mmA')}: ---- Database Connected ----`)
        console.log(`${moment().format('MMM-DD-YYYY hh:mmA')}: ---- Task Started ----`)

        const fileName = `biometric-scans.txt`

        const cronJob = async () => {
            try {

                let file = readFileSync(`${APP_DIR}/${fileName}`)
                // getHash(file)

                file = file.toString('utf-8').trim()
                let rows = file.split("\n")?.map(r => {
                    return r.split(", ")?.map(c => c?.trim())
                })

                // Today only
                rows = rows.filter(r => {
                    return DATE_TO_PROCESS.clone().format('YYYY-MM-DD') === r.at(1)
                })

                // Check logs.db if the entry is already in it
                let promises = rows.map(r => {
                    return Log.findOne({
                        where: {
                            bid: r.at(0),
                            date: r.at(1),
                            time: r.at(2),
                        }
                    })
                })
                let results = await Promise.all(promises)

                // Remove it from the rows to be send to the server
                rows = rows.filter((r, i) => {
                    return (results[i]) ? false : true
                })

                // Sort from earliest log
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

                // Sort from smallest BID
                rows.sort(function (a, b) {
                    try {
                        a = parseInt(a.at(0))
                        b = parseInt(b.at(0))
                        if (a < b) {
                            return -1;
                        }
                        if (a > b) {
                            return 1;
                        }
                        return 0;

                    } catch (_) {
                        return 0;

                    }
                })

                // Group by date
                rows = lodashGroupBy(rows, (row) => row[1])
                // console.log(rows)

                // Structure after groupBy
                /**
                 * {
                        '2024-09-05': [
                            [ '320', '2024-09-05', '08:16:49 AM' ],
                            [ '209', '2024-09-05', '08:17:07 AM' ],
                            [ '284', '2024-09-05', '08:17:33 AM' ],
                            [ '384', '2024-09-05', '08:19:50 AM' ],
                            [ '26', '2024-09-05', '08:19:56 AM' ],
                            [ '138', '2024-09-05', '08:21:09 AM' ],
                            [ '251', '2024-09-05', '08:21:32 AM' ]
                        ]
                    }
                **/

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

                let endPoint = `${url}/app/biometric/scans`
                if(endPoint) {
                    endPoint = `${url}/app/biometric/scans?date=${DATE_TO_PROCESS.format('YYYY-MM-DD')}`
                }
                response = await fetch(endPoint, {
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
                let outext = await response.text()
                console.log(outext)
                writeFileSync(`${APP_DIR}/${DATE_TO_PROCESS.clone().format('MMM-DD-YYYY')}.log`, outext, { encoding: 'utf8', flag: 'w' })

                let logsArray = outext.trim().split("\n").map(s => s.trim())
                logsArray = logsArray.slice(1, -1)
                logsArray = logsArray.filter(s => {
                    return s.includes('CREATED')
                })
                logsArray = logsArray.map(s => {
                    return s.split(',').map(b => b.trim())
                })
                for (let a = 0; a < logsArray.length; a++) {
                    await Log.findOrCreate({
                        where: {
                            bid: logsArray[a].at(0),
                            date: logsArray[a].at(3),
                            time: logsArray[a].at(4),
                        },
                        defaults: {
                            bid: logsArray[a].at(0),
                            date: logsArray[a].at(3),
                            time: logsArray[a].at(4),
                        },
                    });
                }

            } catch (err) {
                console.error(err)
            }

        }
        // await cronJob()
        console.log(`${moment().format('MMM-DD-YYYY hh:mmA')}: Watching file ${fileName}...`)

        watchFile(`${APP_DIR}/${fileName}`, async (curr, prev) => {
            if (curr.mtimeMs > prev.mtimeMs && curr.size !== prev.size) {
                console.log(`${moment().format('MMM-DD-YYYY hh:mmA')}: File change detected, uploading file...`)
                await cronJob()
            }
        });
    } catch (err) {
        console.error(err)
    }
})()