const http = require('http');
const { Pool } = require('pg');

const cluster = require('cluster');

const dotenv = require('dotenv');
dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

function isAnInteger(value) {
    if (isNaN(value) || !Number.isInteger(value) || Math.trunc(value) !== value) return false;

    return true;
}

const server = http.createServer((req, res) => {
    const { method, url } = req;
    let body = [];

    req.on('data', (chunk) => {
        body.push(chunk);
    }).on('end', () => {
        body = Buffer.concat(body).toString();

        if (method === 'POST' && url.startsWith('/clientes')) {
            handlePostClientes(req, res, body);
        } else if (method === 'GET' && url.startsWith('/clientes')) {
            handleGetClientes(req, res);
        } else if (method === 'POST' && url === '/admin/db-reset') {
            handlePostAdminDbReset(req, res);
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Endpoint não encontrado');
        }
    });
});

async function handlePostClientes(req, res, body) {
    const clienteId = parseInt(req.url.split('/')[2]);
    const { valor, tipo, descricao } = JSON.parse(body);

    if (isNaN(clienteId) || !valor || isNaN(valor) || !isAnInteger(valor) || !tipo || (tipo != 'c' && tipo != 'd') || !descricao || !isNaN(descricao) || descricao.length > 10) {
        res.writeHead(422, { 'Content-Type': 'text/plain' });
        res.end('Unprocessable Entity');
        return;
    }

    const cliente = await pool.query('SELECT obter_saldo_limite($1)', [clienteId]);

    if (!cliente.rows[0].obter_saldo_limite) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Cliente não existe');
        return;
    }

    const clientObject = cliente.rows[0].obter_saldo_limite;

    if (clientObject.limite < (clientObject.saldo - valor * -1) && tipo === 'd') {
        res.writeHead(422, { 'Content-Type': 'text/plain' });
        res.end('Saldo não cobre essa transação.');
        return;
    }

    if (clientObject.limite < (clientObject.saldo - valor * -1) && tipo === 'c') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(clientObject));
        return;
    }

    const data = await pool.query('SELECT transacao($1, $2, $3, $4)', [clienteId, valor, tipo, descricao]);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data.rows[0].transacao));
}

async function handleGetClientes(req, res) {
    const clienteId = parseInt(req.url.split('/')[2]);

    if (isNaN(clienteId)) {
        res.writeHead(422, { 'Content-Type': 'text/plain' });
        res.end('Unprocessable Entity');
        return;
    }

    const data = await pool.query('SELECT obter_extrato($1)', [clienteId]);

    if (!data.rows[0].obter_extrato.saldo.limite) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Cliente não existe');
        return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data.rows[0].obter_extrato));
}

async function handlePostAdminDbReset(req, res) {
    await pool.query(`SELECT reset_db()`, []);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Banco de dados resetado com sucesso' }));
}



async function tryConnect(){
    await new Promise((r, t) => setTimeout(() => r(true), 2000)); //2 seconds
    try {
        await pool.connect();
        return
    }catch (e){
        tryConnect();
    }
}

async function run(){
    await tryConnect();

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, '0.0.0.0', process.env.BACKLOG || 512 * 8, () => {
        console.log(`Servidor rodando na porta ${PORT}`);
    });
}


if (cluster.isMaster) {
    console.log(`Master ${process.pid} is running`);

    for (let i = 0; i < process.env.INSTANCES || 0; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died`);
    });

} else {
   console.log(`Worker ${process.pid} started`);
   run();
}