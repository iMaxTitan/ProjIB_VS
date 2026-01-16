interface AzureLoginButtonProps {
  onClick: () => void;
  isLoading?: boolean;
}

export default function AzureLoginButton({ onClick, isLoading = false }: AzureLoginButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-[#4B84EE] hover:bg-[#3B74DE] text-white rounded-md transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isLoading ? (
        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/30 border-t-white"></div>
      ) : (
        <svg
          className="w-5 h-5"
          viewBox="0 0 96 96"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M95.4883 34.6839C95.4883 37.5893 93.1531 39.9245 90.2477 39.9245H61.1911C58.2858 39.9245 55.9505 37.5893 55.9505 34.6839V5.62737C55.9505 2.72198 58.2858 0.386719 61.1911 0.386719H90.2477C93.1531 0.386719 95.4883 2.72198 95.4883 5.62737V34.6839Z"
            fill="currentColor"
          />
          <path
            d="M95.4883 90.1011C95.4883 93.0065 93.1531 95.3417 90.2477 95.3417H61.1911C58.2858 95.3417 55.9505 93.0065 55.9505 90.1011V61.0446C55.9505 58.1392 58.2858 55.804 61.1911 55.804H90.2477C93.1531 55.804 95.4883 58.1392 95.4883 61.0446V90.1011Z"
            fill="currentColor"
          />
          <path
            d="M40.0378 34.6839C40.0378 37.5893 37.7025 39.9245 34.7971 39.9245H5.74056C2.83517 39.9245 0.5 37.5893 0.5 34.6839V5.62737C0.5 2.72198 2.83517 0.386719 5.74056 0.386719H34.7971C37.7025 0.386719 40.0378 2.72198 40.0378 5.62737V34.6839Z"
            fill="currentColor"
          />
          <path
            d="M40.0378 90.1011C40.0378 93.0065 37.7025 95.3417 34.7971 95.3417H5.74056C2.83517 95.3417 0.5 93.0065 0.5 90.1011V61.0446C0.5 58.1392 2.83517 55.804 5.74056 55.804H34.7971C37.7025 55.804 40.0378 58.1392 40.0378 61.0446V90.1011Z"
            fill="currentColor"
          />
        </svg>
      )}
      <span className="text-base font-medium">{isLoading ? 'Вход...' : 'Войти через Azure AD'}</span>
    </button>
  );
} 