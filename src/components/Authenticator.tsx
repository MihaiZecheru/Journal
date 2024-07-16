import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GetUser from '../database/GetUser';
import { User } from '@supabase/supabase-js';

interface Props {
  component: React.ReactNode;
}

const Authenticator = ({ component }: Props) => {
  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const user = await GetUser();
        if (!user) navigate('/login');
        else setUser(user);
      } catch (error) {
        navigate('/login');
      }
    })();
  }, [navigate]);

  return (
    <>
      {user && component}
    </>
  );
}
 
export default Authenticator;