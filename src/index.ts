import express from 'express';
import axios from 'axios';
import bodyParser from 'body-parser';
import fs from 'fs';
import {KeyObject} from "crypto";

const app = express();
const port = 3000;
const config = JSON.parse(fs.readFileSync('proxy-config.json', 'utf-8'));

interface mock {
    status: number,
    headers: any,
    body: any
}
let mocks: { [key: string]: mock[] } = {};

interface log {
    id: number,
    date: Date,
    proxy: string,
    url: string,
    method: string,
}

interface detail {
    id: number,
    date: Date,
    proxy: string,
    url: string,
    method: string,
    request?: {
        headers: any,
        body: any
    },
    response?: {
        status: number,
        headers: any,
        body: any
    },
    error?: any
}

let idx = 0;
const logs : log[] = []
const details: detail[] = []

app.use(bodyParser.json());

function logRequest(proxy: any, url: string, method: any, headers: any, req: any) {
    logs.push({
        id: idx,
        date: new Date(),
        proxy: proxy.name,
        url,
        method
    })

    details.push({
        id: idx,
        date: new Date(),
        proxy: proxy.name,
        url,
        method,
        request: {
            headers,
            body: req.body
        }
    })
}

function logResponse(idx: number, response: any) {
    // @ts-ignore
    const l = details.find(x => x.id == idx); 
    response = {
        status: response.status,
        headers: response.headers,
        body: response.data
    }
    if (l) l.response = response;
}

function logError(idx: number, error: any) {
    // @ts-ignore
    const l = details.find(x => x.id == idx);
    if (l) l.error = error;
}

// @ts-ignore
config.proxies.forEach(proxy => {
    app.use(proxy.route, async (req, res) => {
        idx++;
        try {
            const url = `${proxy.base}${req.originalUrl.replace(proxy.route, '')}`;
            const method: any = req.method.toLowerCase();
            const headers = { ...req.headers, host : (new URL(proxy.base)).host }

            logRequest(proxy, url, method, headers, req);
            
            const pathnameWithoutQuery = req.originalUrl.replace(proxy.route, '').split('?')[0].toLowerCase();
            const key = `${method}-${pathnameWithoutQuery.toLowerCase()}-${proxy.route}`;
            if (mocks[key] && mocks[key].length > 0)
            {
                const mock = mocks[key].pop();
                if (mock)
                {
                    logResponse(idx, mock);
                    res
                        .status(mock.status)
                        .set('X-Proxied-By', 'Fautty-Proxy')
                        .send(mock.body);
                    return;          
                }
            }
            
            const response = await axios({
                method,
                url,
                headers,
                data: req.body
            });
            
            logResponse(idx, response);
            
            res
                .status(response.status)
                .set('X-Proxied-By', 'Fautty-Proxy')
                .send(response.data);

        } catch (error: any) {
            logError(idx, error);
            if (error.response) {
                res
                    .status(error.response.status)
                    .set('X-Proxied-By', 'npm install express axios body-parser typescript ts-node @types/node @types/express @types/body-parser\n')
                    .send(error.response.data);
            } else {
                res.status(500).send('An error occurred while processing your request.');
            }
        }
    });
});

app.get("/logs", (req, res) => {
    // @ts-ignore
    res.json({ logs })
})

app.get("/logs/:idx", (req, res) => {
    // @ts-ignore
    const log = details.find(l => l.id == req.params.idx);
    if (log) {
        res.json(log);
    } else {
        res.status(404).send('Log not found');
    }
})

app.post("/mocks", (req: any, res: any) => {
    const {route, path, method, status, headers, body} = req.body;
    if (!route || !path || !method) {
        res.status(400).send('Invalid request body. Route, path or method required');
    } else {
        const key = `${method.toLowerCase()}-${path.toLowerCase()}-${route.toLowerCase()}`;
        if (!mocks[key]) mocks[key] = [];
        mocks[key].push({status, headers, body});
        res.status(201).json({ msg: 'Mock created', mocks: mocks[key] });
    }
})

app.get("/mocks", (req: any, res: any) => {
    res.json(mocks);
})

app.use((req, res, next) => {
    console.log(`${req.method} ${req.originalUrl}`);
    next();
});


app.listen(port, () => {
    console.log(`Proxy server started on http://localhost:${port}`);
});
