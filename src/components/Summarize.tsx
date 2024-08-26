import { useNavigate, useParams } from "react-router-dom";

const Summarize = () => {
  const navigate = useNavigate();
  const params = useParams();
  
  if (!params.year || !params.month) {
    navigate('/home');
  }

  const year = parseInt(params.year!);
  const month = params.month;

  return (
    <div className="summarize">
      <h1>Summarize</h1>
      <p>Year: {year}</p>
      <p>Month: {month}</p>
    </div>
  );
}
 
export default Summarize;