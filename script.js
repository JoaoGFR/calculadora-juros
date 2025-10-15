// Funções de formatação e utilidade
function formatarMoeda(valor) {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function formatarPorcentagem(valor) {
    return (valor * 100).toFixed(4) + '%';
}
function calcularPMT(VP, i, n) {
    if (n <= 0) return VP;
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

// Função principal de cálculo
function calcularFinanciamento() {
    // 1. Coletar e validar as entradas
    const VP = parseFloat(document.getElementById('valorFinanciado').value);
    const n = parseInt(document.getElementById('prazo').value);
    const dataLiberacao = new Date(document.getElementById('dataLiberacao').value + "T00:00:00");
    const diaVencimento = parseInt(document.getElementById('diaVencimento').value);
    const tipoJuro = document.getElementById('tipoJuro').value;
    const sistema = document.getElementById('sistemaAmortizacao').value;
    const carencia = parseInt(document.getElementById('carencia').value);
    const tipoCarencia = document.getElementById('tipoCarencia').value;
    
    // NOVO: Coleta do tipo de cálculo de juros
    const tipoCalculoJuro = document.getElementById('tipoCalculoJuro').value;

    if (isNaN(VP) || isNaN(n) || VP <= 0 || n <= 0 || isNaN(dataLiberacao.getTime()) || carencia < 0 || carencia >= n) {
        alert("Por favor, preencha os campos com valores válidos. A carência não pode ser maior ou igual ao prazo total.");
        return;
    }

    let taxaMensalReferencia = 0; // Taxa usada para o PMT (pode ser efetiva ou nominal)
    let taxaAnualBase = 0;        // Taxa usada para o cálculo pro-rata (pode ser efetiva ou nominal)
    let indexadorLabel = "";

    // 2. DEFINIÇÃO DA TAXA BASE (MODIFICADO)
    if (tipoCalculoJuro === 'composto') {
        // --- LÓGICA DE JUROS COMPOSTOS (Padrão) ---
        if (tipoJuro === 'PRE') {
            taxaAnualBase = parseFloat(document.getElementById('taxaPreAnual').value) / 100;
            taxaMensalReferencia = Math.pow((1 + taxaAnualBase), (1 / 12)) - 1;
            indexadorLabel = "Pré-fixado";
        } else { // PÓS-FIXADO
            const indexador = parseFloat(document.getElementById('indexador').value) / 100; // a.m.
            const spreadAnual = parseFloat(document.getElementById('spreadAnual').value) / 100;
            const spreadMensal = Math.pow((1 + spreadAnual), (1 / 12)) - 1;
            taxaMensalReferencia = (1 + indexador) * (1 + spreadMensal) - 1; // Soma composta
            taxaAnualBase = Math.pow(1 + taxaMensalReferencia, 12) - 1;
            indexadorLabel = "Pós-fixado";
        }
    } else {
        // --- LÓGICA DE JUROS SIMPLES (Nominal) ---
        if (tipoJuro === 'PRE') {
            taxaAnualBase = parseFloat(document.getElementById('taxaPreAnual').value) / 100;
            taxaMensalReferencia = taxaAnualBase / 12; // Divisão simples
            indexadorLabel = "Pré-fixado";
        } else { // PÓS-FIXADO
            const indexador = parseFloat(document.getElementById('indexador').value) / 100; // a.m.
            const spreadAnual = parseFloat(document.getElementById('spreadAnual').value) / 100;
            const spreadMensal = spreadAnual / 12;
            taxaMensalReferencia = indexador + spreadMensal; // Soma simples
            taxaAnualBase = taxaMensalReferencia * 12;
            indexadorLabel = "Pós-fixado";
        }
    }

    // 3. VARIÁVEIS DE CONTROLE
    const tabelaBody = document.querySelector('#tabelaAmortizacao tbody');
    tabelaBody.innerHTML = '';
    let saldoDevedor = VP;
    let totalJuros = 0;
    let dataVencimentoAnterior = dataLiberacao;
    
    adicionarLinhaTabela(tabelaBody, 0, formatarData(dataLiberacao), indexadorLabel, 0, 0, 0, VP, 0, 0, 0, VP);

    let amortizacaoFixaSAC = 0;
    let valorParcelaPrice = 0;
    
    // 4. CONSTRUÇÃO DA TABELA
    for (let mes = 1; mes <= n; mes++) {
        let dataVencimentoAtual = new Date(dataLiberacao);
        dataVencimentoAtual.setMonth(dataLiberacao.getMonth() + mes);
        dataVencimentoAtual.setDate(diaVencimento);
        
        if (dataVencimentoAtual.getDate() !== diaVencimento) {
            dataVencimentoAtual.setDate(0);
        }

        const diasNoPeriodo = Math.round((dataVencimentoAtual - dataVencimentoAnterior) / (1000 * 60 * 60 * 24));
        const fatorJuros = diasNoPeriodo / 360;
        const juros = saldoDevedor * taxaAnualBase * fatorJuros; // Cálculo pro-rata usa a taxa anual
        totalJuros += juros;

        let amortizacao = 0;
        let valorParcela = 0;
        
        if (mes <= carencia) {
            amortizacao = 0;
            if (tipoCarencia === 'pagar_juros') {
                valorParcela = juros;
            } else { // 'capitalizar'
                valorParcela = 0;
                saldoDevedor += juros;
            }
        } else {
            if (mes === carencia + 1) {
                const prazoRestante = n - carencia;
                if (sistema === 'SAC') {
                    amortizacaoFixaSAC = saldoDevedor / prazoRestante;
                } else if (sistema === 'PRICE') {
                    // O PMT é calculado com a taxa mensal de referência (efetiva ou nominal)
                    valorParcelaPrice = calcularPMT(saldoDevedor, taxaMensalReferencia, prazoRestante);
                }
            }
            
            if (sistema === 'SAC') {
                amortizacao = amortizacaoFixaSAC;
                valorParcela = juros + amortizacao;
            } else if (sistema === 'PRICE') {
                valorParcela = valorParcelaPrice;
                amortizacao = valorParcela - juros;
            }
        }
        
        if (saldoDevedor < amortizacao) {
            amortizacao = saldoDevedor;
        }
        if (mes === n) {
            amortizacao = saldoDevedor;
            valorParcela = juros + amortizacao;
        }

        const saldoInicialPeriodo = saldoDevedor;
        saldoDevedor -= amortizacao;

        adicionarLinhaTabela(tabelaBody, mes, formatarData(dataVencimentoAtual), indexadorLabel, taxaMensalReferencia, diasNoPeriodo, fatorJuros, saldoInicialPeriodo, juros, amortizacao, valorParcela, Math.max(0, saldoDevedor));
        
        dataVencimentoAnterior = dataVencimentoAtual;
    }

    // 6. ATUALIZAR RESUMO
    const taxaAnualEfetiva = Math.pow(1 + taxaMensalReferencia, 12) - 1; // Sempre mostramos a efetiva no final
    document.getElementById('indexadorAplicado').textContent = indexadorLabel + " (" + formatarPorcentagem(taxaMensalReferencia) + ")";
    document.getElementById('taxaEfetivaAnual').textContent = formatarPorcentagem(taxaAnualEfetiva);
    
    const primeiraLinha = tabelaBody.rows[1];
    const primeiraParcela = primeiraLinha ? parseFloat(primeiraLinha.cells[9].textContent.replace('R$', '').replace(/\./g, '').replace(',', '.')) : 0;
    document.getElementById('primeiraParcela').textContent = formatarMoeda(primeiraParcela);
    
    document.getElementById('totalJuros').textContent = formatarMoeda(totalJuros);
}

// Funções auxiliares
function formatarData(data) {
    return new Date(data.getTime() + data.getTimezoneOffset() * 60000).toLocaleDateString('pt-BR');
}

function adicionarLinhaTabela(tabelaBody, mes, dataVenc, indexador, taxaMensal, diasBase360, fatorJuros, saldoInicial, juros, amortizacao, parcela, saldoFinal) {
    const tr = tabelaBody.insertRow();
    
    tr.insertCell().textContent = mes === 0 ? 'Liberação' : mes;
    tr.insertCell().textContent = dataVenc;
    tr.insertCell().textContent = mes === 0 ? '' : indexador;
    tr.insertCell().textContent = mes === 0 ? '' : formatarPorcentagem(taxaMensal);
    tr.insertCell().textContent = mes === 0 ? '' : diasBase360;
    tr.insertCell().textContent = mes === 0 ? '' : fatorJuros.toFixed(6);
    tr.insertCell().textContent = formatarMoeda(saldoInicial);
    tr.insertCell().textContent = formatarMoeda(juros);
    tr.insertCell().textContent = formatarMoeda(amortizacao);
    tr.insertCell().textContent = formatarMoeda(parcela);
    tr.insertCell().textContent = formatarMoeda(saldoFinal);
}

// Executar o cálculo ao carregar a página
window.onload = function() {
    alternarCamposTaxa();
    // Adiciona um listener para recalcular sempre que a nova opção for alterada
    document.getElementById('tipoCalculoJuro').addEventListener('change', calcularFinanciamento);
    calcularFinanciamento();
};