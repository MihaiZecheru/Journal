import { useEffect } from "react";
import { Input, initMDB, Modal } from 'mdb-ui-kit';
import supabase from "../database/config/supabase";
import { Link, useNavigate } from "react-router-dom";
import '../styles/auth.css';

const Register = () => {
  const navigate = useNavigate();

  useEffect(() => {
    initMDB({ Input });

    const registerBtn = document.getElementById('registerBtn');
    registerBtn?.addEventListener('click', () => {
      const name = (document.getElementById('form3Example1c') as HTMLInputElement).value;
      const email = (document.getElementById('form3Example3c') as HTMLInputElement).value;
      const password = (document.getElementById('form3Example4c') as HTMLInputElement).value;
      const repeatPassword = (document.getElementById('form3Example4cd') as HTMLInputElement).value;

      if (!name || !email || !password || !repeatPassword) {
        const modal = document.getElementById('invalid-field-modal') as HTMLElement;
        new Modal(modal).show();
        modal.addEventListener('hidden.bs.modal', () => {
          document.querySelector(".modal-backdrop")?.remove();
        });
        return;
      }

      const emailRegex = new RegExp(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/);
      if (!emailRegex.test(email)) {
        const modal = document.getElementById('invalid-email-modal') as HTMLElement;
        new Modal(modal).show();
        modal.addEventListener('hidden.bs.modal', () => {
          (document.getElementById('form3Example3c') as HTMLInputElement).value = '';
          document.querySelector(".modal-backdrop")?.remove();
        });
        return;
      }

      if (password !== repeatPassword) {
        const modal = document.getElementById('invalid-password-modal') as HTMLElement;
        new Modal(modal).show();
        modal.addEventListener('hidden.bs.modal', () => {
          (document.getElementById('form3Example4c') as HTMLInputElement).value = '';
          (document.getElementById('form3Example4cd') as HTMLInputElement).value = '';
          document.querySelector(".modal-backdrop")?.remove();
        });
        return;
      }

      (async () => {
        const { error } = await supabase.auth.signUp({
          email,
          password
        });

        if (error) {
          const modal = document.getElementById('registration-error-modal') as HTMLElement;
          (modal?.querySelector('.modal-body') as HTMLElement).textContent = error.message;
          new Modal(modal).show();
          modal.addEventListener('hidden.bs.modal', () => {
            document.querySelector(".modal-backdrop")?.remove();
          });
        } else {
          // Successful sign-up
          navigate('/login');
        }
      })();
    });
  }, [navigate]);

  return (
    <div id="register-page">
      <div className="auth-bg">
        <div className="auth-card">
          <div className="auth-brand">
            <i className="fas fa-book-open auth-logo-icon"></i>
            <h1 className="auth-title">Journal</h1>
            <p className="auth-subtitle">Create your account</p>
          </div>

          <form className="mx-1 mx-md-4">
            <div className="d-flex flex-row align-items-center mb-4">
              <i className="fas fa-user fa-lg me-3 fa-fw" style={{ color: '#94a3b8' }}></i>
              <div data-mdb-input-init className="form-outline flex-fill mb-0">
                <input type="text" id="form3Example1c" className="form-control" />
                <label className="form-label" htmlFor="form3Example1c">Your Name</label>
              </div>
            </div>

            <div className="d-flex flex-row align-items-center mb-4">
              <i className="fas fa-envelope fa-lg me-3 fa-fw" style={{ color: '#94a3b8' }}></i>
              <div data-mdb-input-init className="form-outline flex-fill mb-0">
                <input type="email" id="form3Example3c" className="form-control" />
                <label className="form-label" htmlFor="form3Example3c">Your Email</label>
              </div>
            </div>

            <div className="d-flex flex-row align-items-center mb-4">
              <i className="fas fa-lock fa-lg me-3 fa-fw" style={{ color: '#94a3b8' }}></i>
              <div data-mdb-input-init className="form-outline flex-fill mb-0">
                <input type="password" id="form3Example4c" className="form-control" />
                <label className="form-label" htmlFor="form3Example4c">Password</label>
              </div>
            </div>

            <div className="d-flex flex-row align-items-center mb-4">
              <i className="fas fa-key fa-lg me-3 fa-fw" style={{ color: '#94a3b8' }}></i>
              <div data-mdb-input-init className="form-outline flex-fill mb-0">
                <input type="password" id="form3Example4cd" className="form-control" />
                <label className="form-label" htmlFor="form3Example4cd">Repeat your password</label>
              </div>
            </div>

            <div className="auth-links mb-4">
              <span>Already have an account? <Link to="/login">Sign in</Link></span>
            </div>

            <button id="registerBtn" type="button" data-mdb-button-init data-mdb-ripple-init className="btn btn-primary btn-lg">Create Account</button>
          </form>
        </div>
      </div>

      <div className="modal fade" id="invalid-password-modal" tabIndex={ -1 } aria-labelledby="invalid-password-modalLabel" aria-hidden="true">
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="invalid-password-modalLabel">Invalid Password</h5>
              <button type="button" className="btn-close" data-mdb-ripple-init data-mdb-dismiss="modal" aria-label="Close"></button>
            </div>
            <div className="modal-body">Your passwords do not match</div>
            <div className="modal-footer">
              <button type="button" className="btn btn-danger" data-mdb-ripple-init data-mdb-dismiss="modal">Close</button>
            </div>
          </div>
        </div>
      </div>

      <div className="modal fade" id="invalid-field-modal" tabIndex={ -1 } aria-labelledby="invalid-field-modalLabel" aria-hidden="true">
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="invalid-field-modalLabel">Invalid Field</h5>
              <button type="button" className="btn-close" data-mdb-ripple-init data-mdb-dismiss="modal" aria-label="Close"></button>
            </div>
            <div className="modal-body">A name, email, and password are required to register</div>
            <div className="modal-footer">
              <button type="button" className="btn btn-danger" data-mdb-ripple-init data-mdb-dismiss="modal">Close</button>
            </div>
          </div>
        </div>
      </div>

      <div className="modal fade" id="invalid-email-modal" tabIndex={ -1 } aria-labelledby="invalid-email-modalLabel" aria-hidden="true">
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="invalid-email-modalLabel">Invalid Email</h5>
              <button type="button" className="btn-close" data-mdb-ripple-init data-mdb-dismiss="modal" aria-label="Close"></button>
            </div>
            <div className="modal-body">Your email is invalid</div>
            <div className="modal-footer">
              <button type="button" className="btn btn-danger" data-mdb-ripple-init data-mdb-dismiss="modal">Close</button>
            </div>
          </div>
        </div>
      </div>

      <div className="modal fade" id="registration-error-modal" tabIndex={ -1 } aria-labelledby="registration-error-modalLabel" aria-hidden="true">
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="registration-error-modalLabel">Registration Failed</h5>
              <button type="button" className="btn-close" data-mdb-ripple-init data-mdb-dismiss="modal" aria-label="Close"></button>
            </div>
            <div className="modal-body">There was an error while trying to register you to Journal</div>
            <div className="modal-footer">
              <button type="button" className="btn btn-danger" data-mdb-ripple-init data-mdb-dismiss="modal">Close</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Register;
