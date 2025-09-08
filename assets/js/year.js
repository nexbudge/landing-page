const yearSpan = document.getElementById("year");
const currentYear = new Date().getFullYear();
if (currentYear === 2025) yearSpan.textContent = currentYear;
else yearSpan.textContent = `2025 - ${currentYear}`;
