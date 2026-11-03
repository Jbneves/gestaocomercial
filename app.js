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
