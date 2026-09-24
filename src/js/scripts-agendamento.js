/**
 * Calendário de agendamento.
 *
 * As datas disponíveis vêm do nosso servidor (o painel marca quais são).
 * O formulário NÃO grava nome nem telefone em lugar nenhum: ele monta a
 * mensagem e abre o WhatsApp, que é onde a conversa acontece de fato.
 * Assim o site não guarda dado pessoal de cliente.
 */

import { getContent } from './api.js';

const WHATSAPP_PADRAO = '5581998370180';

document.addEventListener('DOMContentLoaded', () => {
  const daysContainer = document.getElementById('days');
  const monthYearDisplay = document.getElementById('month-year');
  const prevButton = document.getElementById('prev');
  const nextButton = document.getElementById('next');
  const floatingMenu = document.getElementById('floating-menu');
  const appointmentForm = document.getElementById('appointment-form');
  const selectedDateInput = document.getElementById('selected-date');
  const nameInput = document.getElementById('name');
  const phoneInput = document.getElementById('phone');
  const cancelButton = document.getElementById('cancel');

  // Não é a página de agendamento.
  if (!daysContainer || !monthYearDisplay) return;

  const MESES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  let currentDate = new Date();
  let availableDates = {};

  function toDateKey(year, month, day) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function formatarData(dateKey) {
    const [year, month, day] = dateKey.split('-');
    return `${day}/${month}/${year}`;
  }

  function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    monthYearDisplay.textContent = `${MESES[month]} de ${year}`;
    daysContainer.replaceChildren();

    const firstWeekday = new Date(year, month, 1).getDay();
    const lastDay = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstWeekday; i++) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      daysContainer.appendChild(empty);
    }

    for (let day = 1; day <= lastDay; day++) {
      const dateKey = toDateKey(year, month + 1, day);
      const dayDiv = document.createElement('div');
      dayDiv.textContent = String(day);

      if (availableDates[dateKey]) {
        dayDiv.classList.add('available');
        dayDiv.setAttribute('role', 'button');
        dayDiv.setAttribute('tabindex', '0');

        const escolher = () => {
          if (selectedDateInput) selectedDateInput.value = dateKey;
          floatingMenu?.classList.remove('hidden');
        };

        dayDiv.addEventListener('click', escolher);
        dayDiv.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            escolher();
          }
        });
      } else {
        dayDiv.classList.add('unavailable');
      }

      daysContainer.appendChild(dayDiv);
    }
  }

  async function carregarDatas() {
    try {
      const data = await getContent('availableDates');
      availableDates = data && typeof data === 'object' ? data : {};
    } catch (error) {
      console.error('Não foi possível carregar as datas:', error.message);
      availableDates = {};
    }
    renderCalendar();
  }

  prevButton?.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
  });

  nextButton?.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
  });

  if (appointmentForm && selectedDateInput && nameInput && phoneInput) {
    appointmentForm.addEventListener('submit', (event) => {
      event.preventDefault();

      const date = selectedDateInput.value;
      const name = nameInput.value.trim();
      const phone = phoneInput.value.trim();

      if (!date || !name || !phone) {
        alert('Preencha todos os campos antes de continuar.');
        return;
      }

      const mensagem =
        `Olá! Gostaria de agendar para ${formatarData(date)}.\n` +
        `Nome: ${name}\n` +
        `Telefone: ${phone}`;

      window.open(
        `https://wa.me/${WHATSAPP_PADRAO}?text=${encodeURIComponent(mensagem)}`,
        '_blank',
        'noopener'
      );

      appointmentForm.reset();
      floatingMenu?.classList.add('hidden');
    });
  }

  cancelButton?.addEventListener('click', () => {
    floatingMenu?.classList.add('hidden');
  });

  carregarDatas();
});
