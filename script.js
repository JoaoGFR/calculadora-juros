// Funções de formatação e utilidade
function formatarMoeda(valor) {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function formatarPorcentagem(valor) {
    return (valor * 100).toFixed(4) + '%';
}
function calcularPMT(VP, i, n) {
    if (n <= 0) return VP; // Se não houver prazo restante, a parcela é o próprio valor
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
    
    // Avança para o próximo mês
    novaData.setMonth(novaData.getMonth() + 1);
    novaData.setDate(dia);
   
    // Tratamento para meses com menos dias (ex: dia 31 em fevereiro)
    // Se ao setar o dia, o mês mudou, significa que o dia não existe. Voltamos para o último dia do mês correto.
    if (novaData.getDate() !== dia) {
        novaData.setDate(0); // Volta para o último dia do mês anterior ao que ele pulou
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

    // NOVO: Coleta dos dados de carência
    const carencia = parseInt(document.getElementById('carencia').value);
    const tipoCarencia = document.getElementById('tipoCarencia').value;

    if (isNaN(VP) || isNaN(n) || VP <= 0 || n <= 0 || isNaN(dataLiberacao.getTime()) || carencia < 0 || carencia >= n) {
        alert("Por favor, preencha os campos com valores válidos. A carência não pode ser maior ou igual ao prazo total.");
        return;
    }

    let taxaEfetivaMensalBase = 0;
    let taxaAnualBase = 0;
    let indexadorLabel = "";

    // 2. DEFINIÇÃO DA TAXA BASE
    if (tipoJuro === 'PRE') {
        taxaAnualBase = parseFloat(document.getElementById('taxaPreAnual').value) / 100;
        taxaEfetivaMensalBase = Math.pow((1 + taxaAnualBase), (1/12)) - 1;
        indexadorLabel = "Pré-fixado";
    } else { // PÓS-FIXADO
        const indexador = parseFloat(document.getElementById('indexador').value) / 100; // % a.m.
        const spreadAnual = parseFloat(document.getElementById('spreadAnual').value) / 100;
        const spreadMensal = Math.pow((1 + spreadAnual), (1/12)) - 1;
        taxaEfetivaMensalBase = (1 + indexador) * (1 + spreadMensal) - 1; // Juros compostos
        taxaAnualBase = Math.pow(1 + taxaEfetivaMensalBase, 12) - 1;
        indexadorLabel = "Pós-fixado";
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
    
    // 4. CONSTRUÇÃO DA TABELA DE ENDIVIDAMENTO (MÊS A MÊS)
    for (let mes = 1; mes <= n; mes++) {
        
        let dataVencimentoAtual = new Date(dataLiberacao);
        dataVencimentoAtual.setMonth(dataVencimentoAtual.getMonth() + mes);
        dataVencimentoAtual.setDate(diaVencimento);
        
        if (dataVencimentoAtual.getDate() !== diaVencimento) {
            dataVencimentoAtual.setDate(0);
        }

        const diasNoPeriodo = Math.round((dataVencimentoAtual - dataVencimentoAnterior) / (1000 * 60 * 60 * 24));
        const fatorJuros = diasNoPeriodo / 360;
        const taxaProRata = taxaAnualBase * fatorJuros;
        const juros = saldoDevedor * taxaProRata;
        totalJuros += juros;

        let amortizacao = 0;
        let valorParcela = 0;
        
        // MODIFICADO: Lógica para tratar período de carência
        if (mes <= carencia) {
            amortizacao = 0; // Na carência, não há amortização
            if (tipoCarencia === 'pagar_juros') {
                valorParcela = juros;
                // Saldo devedor não muda, pois só paga juros
            } else { // 'capitalizar'
                valorParcela = 0;
                saldoDevedor += juros; // Juros são incorporados ao saldo devedor
            }
        } else {
            // Lógica PÓS-CARÊNCIA
            // Se for o primeiro mês após a carência, (re)calculamos a base de amortização/parcela
            if (mes === carencia + 1) {
                const prazoRestante = n - carencia;
                if (sistema === 'SAC') {
                    amortizacaoFixaSAC = saldoDevedor / prazoRestante;
                } else if (sistema === 'PRICE') {
                    valorParcelaPrice = calcularPMT(saldoDevedor, taxaEfetivaMensalBase, prazoRestante);
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
        
        // Ajustes finais para evitar saldo negativo
        if (saldoDevedor < amortizacao) {
            amortizacao = saldoDevedor;
        }
        if (mes === n) { // Última parcela, ajusta para zerar o saldo
            amortizacao = saldoDevedor;
            valorParcela = juros + amortizacao;
        }

        const saldoInicialPeriodo = saldoDevedor;
        saldoDevedor -= amortizacao;

        adicionarLinhaTabela(tabelaBody, mes, formatarData(dataVencimentoAtual), indexadorLabel, taxaAnualBase, diasNoPeriodo, fatorJuros, saldoInicialPeriodo, juros, amortizacao, valorParcela, Math.max(0, saldoDevedor));
        
        dataVencimentoAnterior = dataVencimentoAtual;
    }

    // 6. ATUALIZAR RESUMO
    document.getElementById('indexadorAplicado').textContent = indexadorLabel + " (" + formatarPorcentagem(taxaEfetivaMensalBase) + ")";
    document.getElementById('taxaEfetivaAnual').textContent = formatarPorcentagem(taxaAnualBase);
    
    const primeiraParcela = tabelaBody.rows[1] ? parseFloat(tabelaBody.rows[1].cells[9].textContent.replace('R$', '').replace(/\./g, '').replace(',', '.')) : 0;
    document.getElementById('primeiraParcela').textContent = formatarMoeda(primeiraParcela);
    
    document.getElementById('totalJuros').textContent = formatarMoeda(totalJuros);
}

// Função auxiliar para formatação de data (DD/MM/AAAA)
function formatarData(data) {
    // Adiciona o fuso horário para evitar problemas de data "pulando" um dia
    return new Date(data.getTime() + data.getTimezoneOffset() * 60000).toLocaleDateString('pt-BR');
}

// Função auxiliar para adicionar linha na tabela
function adicionarLinhaTabela(tabelaBody, mes, dataVenc, indexador, taxaAnual, diasBase360, fatorJuros, saldoInicial, juros, amortizacao, parcela, saldoFinal) {
    const tr = tabelaBody.insertRow();
    
    tr.insertCell().textContent = mes === 0 ? 'Liberação' : mes;
    tr.insertCell().textContent = dataVenc;
    tr.insertCell().textContent = mes === 0 ? '' : indexador;
    tr.insertCell().textContent = mes === 0 ? '' : formatarPorcentagem(Math.pow(1 + taxaAnual, 1/12) - 1);
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