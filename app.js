// ==========================================================================
// CONFIGURAÇÃO DA API: Cole aqui a URL obtida no Google Apps Script
// ==========================================================================
const URL_API_PLANILHA = "https://script.google.com/macros/s/AKfycbyWnV8d_iMbeHiXHnjJKQNtHxdhKf7V5QhqrC7YITlT1B2i_HsdybrjuUxXmy6mbWj_yA/exec";

/**
 * Altera a visualização do aplicativo simulando fluxo nativo.
 * @param {number} tela - ID da tela que deve ser renderizada (1 ou 2).
 */
function navegarPara(tela) {
    if (tela === 1) {
        document.getElementById('tela-1').classList.remove('hidden');
        document.getElementById('tela-2').classList.add('hidden');
    } else {
        document.getElementById('tela-1').classList.add('hidden');
        document.getElementById('tela-2').classList.remove('hidden');
    }
}

/**
 * Altera a visibilidade do modal administrativo (painel de controle).
 */
function toggleAdminPanel() {
    const panel = document.getElementById('admin-panel');
    panel.classList.toggle('hidden');
}

/**
 * 1. MÉTODO GET - CARREGAR DADOS
 * Busca as linhas gravadas no Google Sheets e renderiza em tela.
 */
async function carregarDadosDaPlanilha() {
    if (URL_API_PLANILHA === "SUA_URL_DO_APP_DA_WEB_AQUI") {
        console.log("Modo Sandbox ativo: Configure o endpoint para integração com banco real.");
        return;
    }
    try {
        const resposta = await fetch(URL_API_PLANILHA);
        const dados = await resposta.json();

        // Vincula as informações dinâmicas à interface do usuário
        document.querySelectorAll('.lbl-empresa').forEach(el => el.innerText = dados.empresa);
        document.querySelectorAll('.lbl-saldo').forEach(el => el.innerText = dados.saldo);
        document.getElementById('lbl-bloqueado').innerText = dados.bloqueado;
        document.getElementById('t1-nome-header').innerText = dados.nome.split(' ');

        // Sincroniza o formulário administrativo interno
        document.getElementById('edit-nome').value = dados.nome;
        document.getElementById('edit-empresa').value = dados.empresa;
        document.getElementById('edit-saldo').value = dados.saldo;
        document.getElementById('edit-bloqueado').value = dados.bloqueado;
    } catch (erro) {
        console.error("Erro crítico na requisição de dados:", erro);
    }
}

/**
 * 2. MÉTODO POST - SALVAR ALTERAÇÕES
 * Transmite as modificações efetuadas de volta para a nuvem da planilha.
 */
async function salvarAlteracoesNaPlanilha() {
    const dadosAtualizados = {
        nome: document.getElementById('edit-nome').value,
        empresa: document.getElementById('edit-empresa').value,
        saldo: document.getElementById('edit-saldo').value,
        bloqueado: document.getElementById('edit-bloqueado').value
    };

    // Fallback caso o usuário realize testes sem ter implementado a macro do Sheets
    if (URL_API_PLANILHA === "SUA_URL_DO_APP_DA_WEB_AQUI") {
        document.querySelectorAll('.lbl-empresa').forEach(el => el.innerText = dadosAtualizados.empresa);
        document.querySelectorAll('.lbl-saldo').forEach(el => el.innerText = dadosAtualizados.saldo);
        document.getElementById('lbl-bloqueado').innerText = dadosAtualizados.bloqueado;
        document.getElementById('t1-nome-header').innerText = dadosAtualizados.nome.split(' ');
        toggleAdminPanel();
        alert("Modo offline: Interface redefinida localmente para validação imediata!");
        return;
    }

    try {
        const resposta = await fetch(URL_API_PLANILHA, {
            method: 'POST',
            body: JSON.stringify(dadosAtualizados)
        });
        const resultado = await resposta.json();
        
        if (resultado.status === "sucesso") {
            alert("Sincronização concluída! Registro atualizado no Google Sheets.");
            toggleAdminPanel();
            carregarDadosDaPlanilha();
        }
    } catch (erro) {
        console.error("Falha ao propagar dados para o servidor:", erro);
        alert("Erro de conexão: Impossível salvar na planilha externa.");
    }
}

/**
 * 3. EXTRATOR PDF - RELATÓRIO DO HISTÓRICO
 * Transcreve dinamicamente as movimentações para um formato oficial da Caixa.
 */
function gerarPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const trabalhador = document.getElementById('edit-nome').value;
    const empresa = document.getElementById('edit-empresa').value;
    const saldo = document.getElementById('edit-saldo').value;

    // Cabeçalho institucional do documento técnico
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("FGTS", 14, 15);
    doc.text("CAIXA", 170, 15);
    
    doc.line(14, 18, 196, 18);
    
    // Dados Cadastrais Baseados no PDF do histórico enviado
    doc.setFontSize(10);
    doc.text(`TRABALHADOR: ${trabalhador.toUpperCase()}`, 14, 26);
    doc.text(`EMPREGADOR: ${empresa.toUpperCase()}`, 14, 32);
    doc.text(`VALOR PARA FINS RESCISÓRIOS: R$ ${saldo}`, 14, 38);
    
    doc.line(14, 42, 196, 42);
    
    doc.text("HISTÓRICO DE MOVIMENTAÇÕES (LANÇAMENTOS RECENTES)", 14, 50);
    doc.setFont("helvetica", "normal");
    
    // Linhas cronológicas espelhadas da imagem 2 e extrato complementar
    doc.text("21/08/2026   CREDITO DE JAM 0,004199 -------------------------- R\$ 68,22", 14, 60);
    doc.text("20/08/2026   115-DEPOSITO JULHO 2026 --------------------------- R\$ 723,45", 14, 68);
    doc.text("21/07/2026   AC CRED DIST RESULTADO ANO BASE 12/2025 ---------- R\$ 222,42", 14, 76);
    doc.text("23/07/2026   115-JAM RECOLHIDO EMPRESA MAIO 2025 --------------- R\$ 7,97", 14, 84);

    // Baixa o arquivo atribuindo o nome limpo do trabalhador editado
    doc.save(`extrato_fgts_${trabalhador.toLowerCase().replace(/ /g, '_')}.pdf`);
}

// Inicializador assíncrono acionado na carga do documento
window.onload = carregarDadosDaPlanilha;
