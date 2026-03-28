import { useNavigate, Link } from 'react-router-dom';
import '../styles/landing.css';

const Landing = () => {
  const navigate = useNavigate();

  const onBtnClick = () => {
    setTimeout(() => navigate('/login'), 250);
  };

  return (
    <div className="landing">
      <div className="landing-content no-highlight">
        <Link to="/home">
          <i className="fas fa-book-open landing-logo-icon"></i>
          <h1 className="dynamic-font-size landing-title">Journal</h1>
        </Link>
        <p className="landing-tagline">Remember every day</p>
        <button className="cssbuttons-io-button" onClick={ onBtnClick }>
          Get started
          <div className="icon">
            <svg
              height="24"
              width="24"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M0 0h24v24H0z" fill="none"></path>
              <path
                d="M16.172 11l-5.364-5.364 1.414-1.414L20 12l-7.778 7.778-1.414-1.414L16.172 13H4v-2z"
                fill="currentColor"
              ></path>
            </svg>
          </div>
        </button>
      </div>
    </div>
  );
};

export default Landing;
