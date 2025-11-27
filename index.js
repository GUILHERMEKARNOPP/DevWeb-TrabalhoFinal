import 'dotenv/config';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("ERRO: SUPABASE_URL ou SUPABASE_ANON_KEY não configurados.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/Telas', express.static(path.join(__dirname, 'Telas')));

const requireAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Acesso negado.' });

  const { data: userAuth, error } = await supabase.auth.getUser(token);

  if (error || !userAuth.user)
    return res.status(401).json({ error: 'Token inválido.' });

  req.userId = userAuth.user.id;
  next();
};


app.get('/', (req, res) => {
  res.redirect('/Telas/Login/login.html');
});

app.post('/api/auth/register', async (req, res) => {
  const { email, password, nome } = req.body;

  if (!email || !password || !nome) {
    return res.status(400).json({ error: "Campos obrigatórios faltando." });
  }

  try {
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password
    });

    if (signUpError) throw signUpError;

    const newUserId = signUpData.user.id;

    const { error: profileError } = await supabase.from("perfis").insert([
      {
        id: newUserId,
        nome,
        email
      }
    ]);

    if (profileError) {
      console.error("Erro ao salvar perfil:", profileError);
      return res.status(500).json({
        error: "Usuário criado, mas falha ao salvar perfil."
      });
    }

    // Faz login automático
    const { data: sessionData, error: loginError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (loginError)
      return res
        .status(500)
        .json({ error: "Usuário criado, mas falha ao gerar token." });

    res.status(201).json({
      message: "Cadastro realizado com sucesso!",
      token: sessionData.session.access_token
    });

  } catch (error) {
    res.status(400).json({
      error: error.message || "Erro no processo de cadastro."
    });
  }
});


app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: "Email e senha são obrigatórios." });

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error)
    return res.status(401).json({ error: "Credenciais inválidas." });

  res.status(200).json({
    message: "Login realizado com sucesso!",
    token: data.session.access_token
  });
});


app.get('/api/menu', async (req, res) => {
  const { data: menu, error } = await supabase
    .from("menu")
    .select("*")
    .order("category")
    .order("id");

  if (error) {
    console.error("Erro ao buscar cardápio:", error);
    return res.status(500).json({ error: "Falha ao carregar o cardápio." });
  }

  const agrupado = menu.reduce((acc, item) => {
    const cat = item.category || "Outros";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  res.status(200).json(agrupado);
});


app.post('/api/pedidos', requireAuth, async (req, res) => {
  const { items, total } = req.body;

  if (!items || !total)
    return res.status(400).json({ error: "Dados incompletos." });

  const { data, error } = await supabase
    .from("pedidos")
    .insert([
      {
        user_id: req.userId,
        items_json: JSON.stringify(items),
        total,
        status: "Pendente"
      }
    ])
    .select();

  if (error) {
    console.error(error);
    return res.status(500).json({ error: "Erro ao criar pedido." });
  }

  res.status(201).json({ message: "Pedido criado!", pedido: data[0] });
});


app.get('/api/pedidos', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from("pedidos")
    .select("id, total, status, created_at, items_json")
    .eq("user_id", req.userId)
    .order("created_at", { ascending: false });

  if (error)
    return res.status(500).json({ error: "Erro ao buscar pedidos." });

  const formatado = data.map(p => ({
    ...p,
    items: JSON.parse(p.items_json)
  }));

  res.status(200).json(formatado);
});

// INICIAR SERVIDOR
app.listen(PORT, () => {
  console.log(`Servidor ativo em http://localhost:${PORT}`);
});
