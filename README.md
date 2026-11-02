# Gestão Comercial Web — versão 1

Sistema web inicial para comércio e prestação de serviços, com:
- Login por e-mail e senha (Firebase Authentication)
- Clientes
- Produtos e controle básico de estoque (cadastro e quantidade)
- Vendas
- Notas promissórias
- Ordens de serviço para produtos/equipamentos em manutenção
- Fluxo de caixa (entradas, saídas e saldo no resumo)
- Acesso compartilhado para mais de um usuário

## Configuração obrigatória

1. Crie um projeto em https://console.firebase.google.com/
2. Em Authentication > Sign-in method, habilite **E-mail/senha**.
3. Em Authentication > Users, crie os usuários que poderão entrar.
4. Crie um banco em Firestore Database.
5. Em Configurações do projeto > Seus apps, registre um app Web e copie os dados para `firebase-config.js`.
6. Em Firestore > Rules, publique o conteúdo de `firestore.rules`.
7. Sirva os arquivos por um servidor HTTP local ou hospede em HTTPS. Não abra `index.html` diretamente como `file://`.

## Executar localmente

Com Python instalado, abra o terminal nesta pasta e execute:

```bash
python -m http.server 8000
```

Depois acesse http://localhost:8000

## Observações importantes

- O arquivo `firebase-config.js` vem com valores de exemplo; o sistema não conecta antes de preencher a configuração do seu Firebase.
- Para múltiplos usuários, crie uma conta para cada funcionário no Firebase Authentication.
- Esta versão é uma base funcional inicial. Ainda não implementa baixa automática de estoque ao vender, parcelas/recebimentos de promissórias, impressão de OS, relatórios avançados, nem permissões granulares por usuário.
- As regras incluídas permitem acesso a qualquer usuário autenticado. Antes de usar com dados reais de clientes e vendas, implemente regras de acesso por empresa/perfil e faça testes de segurança.
