
# HRIS Connect

    node index.js http://localhost:9094/api fingerprint.scanner.1 Xbdxndsma%


## Autorun Using PM2

    npm install pm2 -g

    pm2 start index.js --log logs.txt -- [api url] [username] [password]