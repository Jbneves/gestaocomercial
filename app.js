// 1. Importe o SDK do Firebase Realtime Database e o seu 'db' (ajuste o caminho se o seu arquivo de configuração tiver outro nome, ex: firebase.js ou config.js)
import { ref, runTransaction, get } from "https://www.gstatic.com/firebasejs/10.x.x/firebase-database.js";
import { db } from "./firebase-config.js"; // Ou o nome do arquivo onde você inicializou o app e exportou o db

// 2. Agora o seu código original vai funcionar perfeitamente:
const stockRef = ref(db, `produtos/${item.id}/quantidade`);

const result = await runTransaction(stockRef, current => {
  if (current === null || current === undefined) {
    return;
  }

  const available = Number(current);

  if (!Number.isFinite(available) || available < item.quantidade) {
    return;
  }

  return available - item.quantidade;
});

if (!result.committed) {
  const currentStock = (await get(stockRef)).val();

  throw new Error(
    `Estoque insuficiente para ${item.nome}. Estoque atual: ${currentStock}.`
  );
}

updatedStocks.push(item);

const result = await runTransaction(stockRef, current => {
  if (current === null || current === undefined) {
    return;
  }

  const available = Number(current);

  if (!Number.isFinite(available) || available < item.quantidade) {
    return;
  }

  return available - item.quantidade;
});

if (!result.committed) {
  const currentStock = (await get(stockRef)).val();

  throw new Error(
    `Estoque insuficiente para ${item.nome}. Estoque atual: ${currentStock}.`
  );
}

updatedStocks.push(item);
