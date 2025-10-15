// Funções de formatação e utilidade
function formatarMoeda(valor) {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function formatarPorcentagem(valor) {
    return (valor * 100).toFixed(4) + '%';
}
function calcularPMT(VP, i, n) {
    if (i === 0) return VP / n;
    return VP * (i / (1 - Math.pow((1 + i), -n)));
}

// Alterna a visibilidade dos campos de taxa
function alternarCamposTaxa() {
    const tipo = document.getElementById('tipoJuro').value;
    document.getElementById('camposPre').style.display = (tipo === 'PRE' ? 'block' : 'none');
    document.getElementById('camposPos').style.display = (tipo === 'POS' ? 'block' : 'none');
}
alternarCamposTaxa(); // Executa na inicialização

// Função para avançar a data de vencimento
function proximoVencimento(dataAtual, diaVencimento) {
    let dia = parseInt(diaVencimento);
    let novaData = new Date(dataAtual);
    novaData.setDate(dia);
    
    // Se a nova data for igual ou anterior à data atual (por ex., 15/10/2025 -> 15/10/2025), avança um mês
    if (novaData <= dataAtual) {
        novaData.setMonth(novaData.getMonth() + 1);
    }
    
    // Corrige para dias inválidos (ex: dia 31 em fevereiro)
    while (novaData.getDate() !== dia) {
        novaData.setDate(0); // Volta para o último dia do mês anterior
        novaData.setDate(dia);
        if (novaData.getDate() !== dia) { // Se ainda for diferente, tenta o próximo mês
             novaData.setMonth(novaData.getMonth() + 1);
        }
    }
    return novaData;
}

// Função principal de cálculo
function calcularFinanciamento() {
    // 1. Coletar e validar as entradas
    const VP = parseFloat(document.getElementById('valorFinanciado').value);
    const n = parseInt(document.getElementById('prazo').value);
    const dataLiberacao = new Date(document.getElementById('dataLiberacao').value + "T00:00:00");
    const diaVencimento = parseInt(document.getElementById('diaVencimento').value);
    const tipoJuro = document.getElementById('tipoJuro').value;
    const sistema = document.getElementById('sistemaAmortizacao').value;

    if (isNaN(VP) || isNaN(n) || VP <= 0 || n <= 0 || isNaN(dataLiberacao.getTime())) {
        alert("Por favor, preencha todos os campos com valores válidos.");
        return;
    }

    let taxaEfetivaMensalBase = 0; // i mensal para cálculo inicial (PRICE)
    let indexadorLabel = "";

    // 2. DEFINIÇÃO DA TAXA BASE
    if (tipoJuro === 'PRE') {
        const taxaPreAnual = parseFloat(document.getElementById('taxaPreAnual').value) / 100;
        // Conversão exponencial de Anual para Mensal (Juros Compostos)
        taxaEfetivaMensalBase = Math.pow((1 + taxaPreAnual), (1/12)) - 1;
        indexadorLabel = "Pré-fixado";
    } else { // PÓS-FIXADO
        const indexador = parseFloat(document.getElementById('indexador').value) / 100; // % a.m.
        const spreadAnual = parseFloat(document.getElementById('spreadAnual').value) / 100;
        
        // Converte o Spread Anual para Mensal (composto)
        const spreadMensal = Math.pow((1 + spreadAnual), (1/12)) - 1;
        
        // Taxa Mensal Total Pós-fixada simulada
        taxaEfetivaMensalBase = indexador + spreadMensal;
        indexadorLabel = "CDI/TLP + Spread";
    }

    // 3. VARIÁVEIS DE CONTROLE
    const tabelaBody = document.querySelector('#tabelaAmortizacao tbody');
    tabelaBody.innerHTML = '';
    let saldoDevedor = VP;
    let totalJuros = 0;
    let dataVencimentoAnterior = dataLiberacao;
    let valorParcelaPrice = 0;
    let amortizacaoFixaSAC = VP / n;

    // Se PRICE, calcula a Parcela Fixa (PMT) com a taxa base
    if (sistema === 'PRICE') {
        valorParcelaPrice = calcularPMT(VP, taxaEfetivaMensalBase, n);
    }
    
    // Adicionar Linha 0 (Liberação)
    adicionarLinhaTabela(tabelaBody, 0, formatarData(dataLiberacao), indexadorLabel, 0, 0, 0, VP, 0, 0, VP, "table-initial-row");

    // 4. CONSTRUÇÃO DA TABELA DE ENDIVIDAMENTO (MÊS A MÊS)
    for (let mes = 1; mes <= n; mes++) {
        
        // a) Cálculo das Datas
        let dataVencimentoAtual;
        
        if (mes === 1) {
            // 1ª parcela vence no próximo dia fixo de vencimento
            dataVencimentoAtual = proximoVencimento(dataLiberacao, diaVencimento);
        } else {
            // As demais vencem exatamente 1 mês depois (mantendo o dia fixo)
            dataVencimentoAtual = proximoVencimento(dataVencimentoAnterior, diaVencimento);
        }
        
        // b) Fator Multiplicador (Base 360 Dias - VEC)
        const diasNoPeriodo = Math.ceil((dataVencimentoAtual - dataVencimentoAnterior) / (1000 * 60 * 60 * 24)); // Diferença em dias corridos
        const diasBase360 = diasNoPeriodo; // Para a convenção 30/360, dias corridos são frequentemente usados
        const fatorJuros = diasBase360 / 360; // Fator multiplicador para a taxa ANUAL

        // c) Cálculo da Taxa
        // Taxa ANUAL Efetiva para Juros Diários (usa o fator pro-rata)
        // Se a taxa Mensal Base foi convertida de anual, precisamos convertê-la de volta
        let taxaAnualBase = (tipoJuro === 'PRE') 
            ? parseFloat(document.getElementById('taxaPreAnual').value) / 100
            : (Math.pow(1 + CDI_mensal_simulado, 12) * Math.pow(1 + spreadMensal, 12)) - 1; // Taxa Anual Pós-Fixada simulada
            
        // Taxa de Juros Pro Rata Die
        const taxaProRata = taxaAnualBase * fatorJuros;

        // d) Juros (Compostos)
        const juros = saldoDevedor * taxaProRata;
        totalJuros += juros;

        // e) Amortização e Parcela
        let amortizacao = 0;
        let valorParcela = 0;

        if (sistema === 'SAC') {
            amortizacao = amortizacaoFixaSAC;
            valorParcela = juros + amortizacao;
        } else if (sistema === 'PRICE') {
            // No PRICE com juros variáveis/pro-rata, a parcela DEIXA DE SER FIXA (ela é recalculada)
            // Se o contrato é estritamente PRICE, a amortização seria (ValorPMT Fixo - Juros)
            // Mas para ser exato com pro-rata, faremos o cálculo da parcela variável:
            valorParcela = calcularPMT(VP, taxaEfetivaMensalBase, n); // Usa o PMT inicial, mas o Juro varia
            amortizacao = valorParcela - juros;
            
            // Correção PRICE: se a amortização for negativa, a Parcela deve ser igual ao Juros + Saldo!
            if (amortizacao < 0) {
                 amortizacao = 0; 
                 valorParcela = juros;
            }
        }
        
        // f) Saldo Final
        const saldoFinal = saldoDevedor - amortizacao;
        saldoDevedor = saldoFinal; 
        
        // 5. Adicionar Linha à Tabela
        adicionarLinhaTabela(tabelaBody, mes, formatarData(dataVencimentoAtual), indexadorLabel, taxaAnualBase, diasBase360, fatorJuros, saldoDevedor + amortizacao, juros, amortizacao, valorParcela, Math.max(0, saldoDevedor));
        
        dataVencimentoAnterior = dataVencimentoAtual;
    }

    // 6. ATUALIZAR RESUMO
    const taxaAnualResultado = taxaAnualBase;
    const taxaMensalResultado = taxaEfetivaMensalBase;
    const totalPago = totalJuros + VP;
    const cetJuros = totalJuros / VP;
    
    document.getElementById('indexadorAplicado').textContent = indexadorLabel + " (" + formatarPorcentagem(taxaMensalResultado) + ")";
    document.getElementById('taxaEfetivaAnual').textContent = formatarPorcentagem(taxaAnualResultado);
    
    const primeiraParcela = tabelaBody.rows[1] ? parseFloat(tabelaBody.rows[1].cells[9].textContent.replace('R$', '').replace('.', '').replace(',', '.')) : 0;
    document.getElementById('primeiraParcela').textContent = formatarMoeda(primeiraParcela);
    
    document.getElementById('totalJuros').textContent = formatarMoeda(totalJuros);
    document.getElementById('totalPago').textContent = formatarMoeda(totalPago); 
    document.getElementById('cetJuros').textContent = formatarPorcentagem(cetJuros);
}

// Função auxiliar para formatação de data (DD/MM/AAAA)
function formatarData(data) {
    return data.toLocaleDateString('pt-BR');
}

// Função auxiliar para adicionar linha na tabela (com todas as novas colunas)
function adicionarLinhaTabela(tabelaBody, mes, dataVenc, indexador, taxaAnual, diasBase360, fatorJuros, saldoInicial, juros, amortizacao, parcela, saldoFinal, className = "") {
    const tr = tabelaBody.insertRow();
    tr.className = className;
    
    tr.insertCell().textContent = mes === 0 ? 'Liberação' : mes;
    tr.insertCell().textContent = dataVenc;
    tr.insertCell().textContent = mes === 0 ? indexador : (indexador.split(' ')[0] || indexador);
    tr.insertCell().textContent = mes === 0 ? '' : formatarPorcentagem(taxaAnual / 12); // Apenas a taxa mensal proporcional
    tr.insertCell().textContent = mes === 0 ? '' : diasBase360;
    tr.insertCell().textContent = mes === 0 ? '' : fatorJuros.toFixed(6);
    tr.insertCell().textContent = formatarMoeda(saldoInicial);
    tr.insertCell().textContent = formatarMoeda(juros);
    tr.insertCell().textContent = formatarMoeda(amortizacao);
    tr.insertCell().textContent = formatarMoeda(parcela);
    tr.insertCell().textContent = formatarMoeda(saldoFinal);
}

// Executar o cálculo ao carregar a página com os valores padrão
window.onload = function() {
    alternarCamposTaxa();
    calcularFinanciamento();
};