const form = document.querySelector('.quiz-form');

form.addEventListener('submit', (e) => {
  e.preventDefault();

  const quizName = document.getElementById('quizName').value;
  const quizDescription = document.getElementById('quizDescription').value;

  // TEMPORAIRE : stocker en local
  localStorage.setItem('quizName', quizName);
  localStorage.setItem('quizDescription', quizDescription);

  // Redirection prochaine étape
  window.location.href = 'lobby.html';
});
