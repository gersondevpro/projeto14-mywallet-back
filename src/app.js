import express from 'express';
import cors from 'cors';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import joi from 'joi';
import { v4 as uuidV4 } from 'uuid';
dotenv.config();

const app = express();

const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;
mongoClient.connect();
db = mongoClient.db("myWallet");

const cadastroSchema = joi.object({
    name: joi.string().required().min(4).max(30),
    email: joi.string().required().email(),
    password: joi.string().required().min(6),
    passwordConfirm: joi.string().required().min(6)
});

const depositoSchema = joi.object({
    deposit: joi.number().required(),
    description: joi.string().min(5)
})

const saidaSchema = joi.object({
    withdraw: joi.number().required(),
    description: joi.string().min(5)
})

app.use(cors());
app.use(express.json());

const bancoDeUsuarios = db.collection("usuarios")
const sessaoDeUsuario = db.collection("sessoes")
const movimentacaoUsuario = db.collection("movimentacao")

app.post("/novoCadastro", async (req, res) => {
    const cadastroCliente = req.body;
    
    const errosDeCadastro = cadastroSchema.validate(cadastroCliente, { abortEarly: false });
    if (errosDeCadastro.error) {
        const mapDeErros = errosDeCadastro.error.details.map(erro => erro.message);
        return res.status(401).send(mapDeErros);
    };

    try {
        if (cadastroCliente.password !== cadastroCliente.passwordConfirm) {
            return res.status(401).send("Senha e confirmação de senha não são iguais!");
        };
        
    const passowrdHash = bcrypt.hashSync(cadastroCliente.password, 10);


        const conflitoDeEmail = await bancoDeUsuarios.findOne({ email: cadastroCliente.email })
        if (conflitoDeEmail) {
            return res.status(409).send("Email já cadastrado!");
        };

        delete cadastroCliente.passwordConfirm;
        await bancoDeUsuarios.insertOne({ ...cadastroCliente, password: passowrdHash });
        return res.sendStatus(201);

    } catch (err) {
        console.log(err);
        res.sendStatus(500);
    };
});

app.post("/", async (req, res) => {
    const { email, password } = req.body;

    try {
        const encontraUsuario = await bancoDeUsuarios.findOne({email});
        if(!encontraUsuario) {
            return res.status(404).send("Dados incorretos!");
        };

        const comparaSenha = bcrypt.compareSync(password, encontraUsuario.password)
        if(!comparaSenha) {
            return res.status(404).send("Dados incorretos.");
        };

        const token = uuidV4()
        await sessaoDeUsuario.insertOne({
            userId: encontraUsuario._id,
            token
        });

        return res.sendStatus(200);    
    } catch (err) {
        console.log(err);
        return res.sendStatus(500);
    };
});

app.post('/novaEntrada', async (req, res) => {
    const { authorization } = req.headers;
    const token = authorization?.replace("Bearer ", "");
    const entrada = req.body;

    if(!token) {
        return res.sendStatus(404);
    };

    try {

        const encontraToken = await sessaoDeUsuario.findOne({token});
        const validaUsuario = await bancoDeUsuarios.findOne({_id: encontraToken?.userId});
        
        if(!validaUsuario) {
            return res.sendStatus(401);
        };

        const validaEntrada = depositoSchema.validate(entrada, { abortEarly: false });
        if(validaEntrada.error) {
            const mapDeErros = validaEntrada.error.details.map(erro => erro.message);
            return res.status(400).send(mapDeErros);
        };

        const cadastroDeEntradaNoBanco = await movimentacaoUsuario.insertOne({
            name: validaUsuario.name,
            userId: validaUsuario._id,
            deposit: entrada.deposit,
            description: entrada.description
        });

        return res.status(200).send(cadastroDeEntradaNoBanco);

    } catch (err) {
        console.log(err);
        return res.sendStatus(500);
    };
});

app.post('/novaSaida', async (req, res) => {
    const { authorization } = req.headers;
    const token = authorization?.replace("Bearer ", "");
    const saida = req.body;

    if(!token) {
        return res.sendStatus(404);
    };

    try {

        const encontraToken = await sessaoDeUsuario.findOne({token});
        const validaUsuario = await bancoDeUsuarios.findOne({_id: encontraToken?.userId});
        
        if(!validaUsuario) {
            return res.sendStatus(401);
        };

        const validaSaida = saidaSchema.validate(saida, { abortEarly: false });
        if(validaSaida.error) {
            const mapDeErros = validaSaida.error.details.map(erro => erro.message);
            return res.status(400).send(mapDeErros);
        };

        const cadastroDeSaidaDoBanco = await movimentacaoUsuario.insertOne({
            name: validaUsuario.name,
            userId: validaUsuario._id,
            withdraw: saida.withdraw*-1,
            description: saida.description
        });

        return res.status(200).send(cadastroDeSaidaDoBanco);

    } catch (err) {
        console.log(err);
        return res.sendStatus(500);
    };
});

app.get('/extrato', async (req, res) => {
    const { authorization } = req.headers;
    const token = authorization?.replace("Bearer ", "");

    if(!token) {
        return res.sendStatus(404);
    };

    try {

        const encontraToken = await sessaoDeUsuario.findOne({token});
        const validaUsuario = await bancoDeUsuarios.findOne({_id: encontraToken?.userId});
        
        if(!validaUsuario) {
            return res.sendStatus(401);
        };

        const extratoUsuario = await movimentacaoUsuario.find({userId: validaUsuario?._id}).toArray();

        console.log(extratoUsuario)
        return res.status(200).send(extratoUsuario);

    } catch (err) {
        console.log(err);
        return res.sendStatus(500);
    };
})

app.listen(5000);