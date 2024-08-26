import { Input, initMDB, Modal } from 'mdb-ui-kit';
import { useEffect } from 'react';
import supabase from '../database/config/supabase';
import { Link, useNavigate } from 'react-router-dom';

const isSignedIn = async (): Promise<boolean> => {
  const { data: { session } } = await supabase.auth.getSession();
	return !!session;
}

const Login = () => {
  const navigate = useNavigate();

  useEffect(() => {
    initMDB({ Input });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') navigate("/home");
    });
		
		isSignedIn().then(__isSignedIn => {
			if (__isSignedIn) navigate('/home');
		});

    const emailBox = document.getElementById('email-box') as HTMLInputElement;
    const passwordBox = document.getElementById('password-box') as HTMLInputElement;
    const loginBtn = document.getElementById('login-btn') as HTMLButtonElement;
    const forgotPasswordBtn = document.getElementById('forgot-password-btn') as HTMLAnchorElement;

    loginBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const email = emailBox.value;
      const password = passwordBox.value;

      if (email === 'chris') return await supabase.auth.signInWithPassword({ email: process.env.REACT_APP_CHRIS_LOGIN_EMAIL!, password: process.env.REACT_APP_CHRIS_LOGIN_PASSWORD! });
      else if (email === 'erin') return await supabase.auth.signInWithPassword({ email: process.env.REACT_APP_ERIN_LOGIN_EMAIL!, password: process.env.REACT_APP_ERIN_LOGIN_PASSWORD! });

      if (!email || !password) return;
      let { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error?.message === 'Invalid login credentials') {
        const modal = document.getElementById('invalid-login-modal') as HTMLElement;
        new Modal(modal).show();
        modal.addEventListener('hidden.bs.modal', () => {
          document.querySelector(".modal-backdrop")?.remove();
        });
        return;
      }

      if (error?.message) {
        const modal = document.getElementById('error-modal') as HTMLElement;
        (modal.querySelector('.modal-body') as HTMLElement)!.textContent = error.message;
        new Modal(modal).show();
        modal.addEventListener('hidden.bs.modal', () => {
          document.querySelector(".modal-backdrop")?.remove();
        });
      }
    });

    forgotPasswordBtn.addEventListener('click', async () => {
      const modal = document.getElementById('forgot-password-modal') as HTMLElement;
      new Modal(modal).show();
      modal.addEventListener('hidden.bs.modal', () => {
        document.querySelector(".modal-backdrop")?.remove();
      });

      document.getElementById("send-email-btn")?.addEventListener('click', async () => {
        const email = (modal.querySelector('input') as HTMLInputElement).value;
        let { error } = await supabase.auth.resetPasswordForEmail(email);

        if (error) {
          console.error(error.message);
          throw error;
        }
      });
    });

    return () => {
      authListener?.subscription.unsubscribe();
    }
  }, [navigate]);
  return (
    <div id="login-page">
      <section className="vh-100">
        <div className="container py-5 h-100">
          <div className="row d-flex align-items-center justify-content-center h-100">
            <div className="col-md-8 col-lg-7 col-xl-6">
              <img src="https://mdbcdn.b-cdn.net/img/Photos/new-templates/bootstrap-login-form/draw2.svg"
                className="img-fluid" />
            </div>
            <div className="col-md-7 col-lg-5 col-xl-5 offset-xl-1">
              <form>
                <div data-mdb-input-init className="form-outline mb-4">
                  <input type="email" name="email" id="email-box" className="form-control form-control-lg" autoComplete="on" />
                  <label className="form-label" htmlFor="email-box">Email address</label>
                </div>

                <div data-mdb-input-init className="form-outline mb-4">
                  <input type="password" name="password" id="password-box" className="form-control form-control-lg" autoComplete="on" />
                  <label className="form-label" htmlFor="password-box">Password</label>
                </div>

                <div className="d-flex justify-content-around align-items-center mb-4">
                  <div>
                    <span>New to Journal?</span><Link to="/register"> Register now</Link>
                  </div>
                  <a href="" role="button" id="forgot-password-btn">Forgot password?</a>
                </div>

                <button type="submit" data-mdb-button-init data-mdb-ripple-init className="btn btn-primary btn-lg btn-block" id="login-btn">Login</button>

              </form>
            </div>
          </div>
        </div>
      </section>

      <div className="modal fade" id="invalid-login-modal" tabIndex={ -1 } aria-labelledby="invalid-login-modalLabel" aria-hidden="true">
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="invalid-login-modalLabel">Invalid Login</h5>
              <button type="button" className="btn-close" data-mdb-ripple-init data-mdb-dismiss="modal" aria-label="Close"></button>
            </div>
            <div className="modal-body">The email or password you've entered is invalid</div>
            <div className="modal-footer">
              <button type="button" className="btn btn-danger" data-mdb-ripple-init data-mdb-dismiss="modal">Close</button>
            </div>
          </div>
        </div>
      </div>

      <div className="modal fade" id="error-modal" tabIndex={ -1 } aria-labelledby="error-modal-label" aria-hidden="true">
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="error-modal-label">Error</h5>
              <button type="button" className="btn-close" data-mdb-ripple-init data-mdb-dismiss="modal" aria-label="Close"></button>
            </div>
            <div className="modal-body"> FILLED DYNAMICALLY ON ERROR</div>
            <div className="modal-footer">
              <button type="button" className="btn btn-danger" data-mdb-ripple-init data-mdb-dismiss="modal">Close</button>
            </div>
          </div>
        </div>
      </div>

      <div className="modal fade" id="forgot-password-modal" tabIndex={ -1 } aria-labelledby="forgot-password-modal-label" aria-hidden="true">
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="error-modal-label">Password Reset Email</h5>
              <button type="button" className="btn-close" data-mdb-ripple-init data-mdb-dismiss="modal" aria-label="Close"></button>
            </div>
            <div className="modal-body">
              <p>A password reset link will be emailed to your email address. Double check that you spell it correctly. Check your spam folder if you can't find the email.</p>
              <div data-mdb-input-init className="form-outline">
                <input type="email" id="email-for-password-reset" className="form-control form-control-lg" />
                <label className="form-label" htmlFor="email-for-password-reset">Email address</label>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-primary" data-mdb-ripple-init data-mdb-dismiss="modal" id="send-email-btn">Send Email</button>
              <button type="button" className="btn btn-secondary" data-mdb-ripple-init data-mdb-dismiss="modal">Close</button>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
 
export default Login;