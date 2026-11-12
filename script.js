const log = document.getElementById('chat-log');
const form = document.getElementById('chat-form');
const input = document.getElementById('chat-input');

function addMessage(text, who) {
  const div = document.createElement('div');
  div.className = 'msg ' + who;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function botReply(question) {
  const q = question.toLowerCase();
  if (q.includes('hello') || q.includes('hi')) return 'Hello! Welcome to Nicom-AI. How can I help you today?';
  if (q.includes('name')) return 'I am Nicom-AI, the assistant for Nicom Online.';
  if (q.includes('service') || q.includes('offer')) return 'We offer AI automation, data insights and conversational assistants for your business.';
  if (q.includes('contact')) return 'You can reach Nicom Online at nicomonline.co.za.';
  return 'That is a great question. In this demo I run on simple rules, but the production Nicom-AI connects to a real language model.';
}

addMessage('Hello! I am Nicom-AI. Ask me anything to see how I work.', 'bot');

form.addEventListener('submit', function (e) {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  addMessage(text, 'user');
  input.value = '';
  setTimeout(function () { addMessage(botReply(text), 'bot'); }, 500);
});