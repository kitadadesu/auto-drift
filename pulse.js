// One outstanding wakeup prevents a frozen page accumulating timer messages.
// The audio clock catches up once if the browser/OS suspends the worker.
let timer, pending = false;
onmessage = ({data}) => {
  if (data === 'ack') { pending = false; return; }
  clearInterval(timer); pending = false;
  if (data) timer = setInterval(() => {
    if (!pending) { pending = true; postMessage(0); }
  }, 500);
};
