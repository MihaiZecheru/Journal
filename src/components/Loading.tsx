const Loading = () => {
  return (
    <div className="loading-cover">
      <div className="loading-inner">
        <i className="fas fa-book-open loading-logo-icon"></i>
        <div className="spinner-border journal-spinner" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    </div>
  );
}

export default Loading;
