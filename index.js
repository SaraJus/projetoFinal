const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const path = require("path");
const { log } = require("console");
const bodyParser = require("body-parser");

const app = express();
const PORT = 3000;
const SECRET_KEY = "minha_chave_secreta";

// Banco de dados em memória
const inMemoryDB = {
  logs: [],
  progresso: [],
};

app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Conexão com o MongoDB
mongoose
  .connect(
    "mongodb+srv://05gabrielasantos:12345@cluster0.tb4ma.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0",
    { useNewUrlParser: true }
  )
  .then(() => console.log("Conectado ao MongoDB"))
  .catch((err) => console.error("Erro ao conectar ao MongoDB:", err));

// Modelo de Usuário
const userSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  senha: { type: String, required: true },
  role: { type: String, enum: ["user", "admin"], default: "user" },
});

userSchema.pre("save", function (next) {
  if (!this.isModified("senha")) return next();
  this.senha = bcrypt.hashSync(this.senha, 10);
  next();
});

userSchema.methods.comparePassword = function (senha) {
  return bcrypt.compareSync(senha, this.senha);
};

const User = mongoose.model("User", userSchema);

// Modelo de Projeto
const projectSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  descricao: String,
});

const Project = mongoose.model("Project", projectSchema);

// Middleware de Autenticação
function autenticarToken(req, res, next) {
  const token = req.headers["authorization"];
  if (!token) return res.status(403).send("Token não fornecido.");

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).send("Token inválido.");
    req.user = user;
    next();
  });
}

function verificarAdmin(req, res, next) {
  if (req.user.role !== "admin")
    return res.status(403).send({ status: 403, message: "Acesso negado." });
  next();
}

//
app.get("/cadastro", (req, res) => {
  res.sendFile(path.join(__dirname, "public/cadastro.html"));
});
//
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

// Rotas de Autenticação
app.post("/auth/register", async (req, res) => {
  try {
    const { nome, email, senha } = req.body;
    if (await User.findOne({ email })) {
      return res.status(400).send("Email já cadastrado.");
    }
    const user = new User({ nome, email, senha });
    await user.save();
    res.status(200).send(
      `
      <script>
         window.location.href = '/login';
       </script>
      `
    );
  } catch (err) {
    log(err);
    res
      .status(500)
      .send({ status: 500, message: "Erro ao registrar usuário." });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, senha } = req.body;
    const usuario = await User.findOne({ email });
    if (!usuario || !usuario.comparePassword(senha))
      return res.status(401).send("Credenciais inválidas.");
    const token = jwt.sign(
      { id: usuario._id, role: usuario.role },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    res.send(`
        <script>
          localStorage.setItem('token', '${token}');
          window.location.href = '/listagem-projetos';
        </script>
      `);

    // res.json({ message: "Login bem-sucedido", token });
  } catch {
    res.status(500).send("Erro ao realizar login.");
  }
});

// Rotas de Projetos
app.get("/listagem-projetos", (req, res) => {
  res.sendFile(path.join(__dirname, "public/listagem-projetos.html"));
});

app.get("/novo-projeto", (req, res) => {
  res.sendFile(path.join(__dirname, "public/novo-projeto.html"));
});

app.get("/editar-projeto/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "public/editar-projeto.html"));
});

app.post("/projeto", autenticarToken, async (req, res) => {
  try {
    const projeto = new Project(req.body);
    await projeto.save();
    res
      .status(200)
      .send({ status: 200, message: "Projeto criado com sucesso!" });
  } catch {
    res.status(500).send({ status: 500, message: "Erro ao criar projeto." });
  }
});

app.put("/projeto/:id", autenticarToken, async (req, res) => {
  try {
    
    const projeto = await Project.findOneAndUpdate({_id: req.params.id}, req.body);
    // projeto.save()

    res
      .status(200)
      .send({ status: 200, message: "Projeto editado com sucesso!" });
  } catch(e) {
    console.log(e)
    res.status(500).send({ status: 500, message: "Erro ao editar projeto." });
  }
});

app.get("/projetos", autenticarToken, async (req, res) => {
  const projetos = await Project.find();
  res.send(projetos);
});

app.get("/projeto/:id", autenticarToken, async (req, res) => {
  const projetos = await Project.findById(req.params.id);
  res.send(projetos);
});

app.delete(
  "/projetos/:id",
  autenticarToken,
  verificarAdmin,
  async (req, res) => {
    try {
      await Project.findByIdAndDelete(req.params.id);
      res.status(200).send({ status: 200, message: "Projeto deletado." });
    } catch {
      res
        .status(500)
        .send({ status: 200, message: "Erro ao deletar projeto." });
    }
  }
);

// Rotas de Dados Temporários (Memória)
app.post("/temp/:collection", autenticarToken, (req, res) => {
  const { collection } = req.params;
  if (!inMemoryDB[collection]) return res.status(400).send("Coleção inválida.");

  const newItem = req.body;
  newItem.id = inMemoryDB[collection].length + 1;
  inMemoryDB[collection].push(newItem);

  res.status(201).send(`Item adicionado em ${collection}`);
});

app.get("/temp/:collection", autenticarToken, (req, res) => {
  const { collection } = req.params;
  res.send(inMemoryDB[collection] || []);
});

app.delete("/temp/:collection/:id", autenticarToken, (req, res) => {
  const { collection, id } = req.params;
  if (!inMemoryDB[collection]) return res.status(400).send("Coleção inválida.");

  inMemoryDB[collection] = inMemoryDB[collection].filter(
    (item) => item.id !== parseInt(id)
  );
  res.send(`Item com ID ${id} removido de ${collection}`);
});

// Middleware centralizado para erros
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Algo deu errado!");
});

// Iniciar o servidor
app.listen(PORT, () =>
  console.log(`Servidor rodando em http://localhost:${PORT}`)
);
