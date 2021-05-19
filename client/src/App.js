import React from 'react';
import './App.css';

import { Navbar, Button, Container, Spinner, Alert, Accordion, Card, Row } from 'react-bootstrap';

class  App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      searchText: '',
      searchResults: [],
      loading: false,
      alertShow: false,
      alert: '',
      alertType: 'secondary'
    };
  }

  componentDidMount() {
    this.handleSearchClick('pyats');
  }
  
  hostname = window.location.hostname || 'localhost';
  hostport = window.location.port || '5000';

  showLoading = () => {
    this.setState({loading: true});
    this.render();
  }

  stopLoading = () => {
    this.setState({loading: false});
    this.render();
  }

  showAlert = (message, type) => {
    this.setState({
      alertShow: true,
      alert: message,
      alertType: type
    })
    setTimeout(() => {
      if (this.state.alertShow) {
        this.setState({
          alertShow: false,
          alert: '',
          alertType: ''
        })
      }
    }, 5000)
  }

  dismissAlert = () => {
    this.setState({
      alertShow: false,
      alert: '', 
      alerType: ''
    })
  }

  handleSearchTextChange = (event) => {
    this.setState({
      searchText: event.target.value
    });
  }

  handleSearchClick = (terms) => {
    let { searchText } = this.state;
    searchText = (terms && typeof terms == 'string') ? terms: searchText;
    this.showLoading();

    // let url = `http://${this.hostname}:${this.hostport}/_search?terms=${searchText}`;
    let url = `http://${this.hostname}:5000/_search?terms=${searchText}`;

    fetch(url).then(response => {
      return response.json();
    }).then(data => {
      console.log(data);
      this.stopLoading();
      this.setState({
        searchResults: data.result
      })
      if (data.result.length === 0) {
        this.showAlert(`No result found for query ${searchText}!`, 'secondary')
      }
    }).catch(err => {
      console.log(`Fetch search result error: ${err}`)
      this.stopLoading();
      this.showAlert(`Fetch search result error: ${err}`, 'danger');
    })
  };

  render() {
    const {searchResults, loading, alert, alertType, alertShow} = this.state;
    return (
      <>
        <Navbar bg="dark" variant="dark" className="d-flex fixed-top">
          <Navbar.Brand href="./" className="col-3">Fancy Search</Navbar.Brand>
          <input 
            type="text" 
            className="search-input col-6 m-auto" 
            placeholder="Search documents ..." 
            onChange={this.handleSearchTextChange}
          />
          <Container className="col-3">
            <Button
              variant="primary"
              disabled={loading}
              onClick={!loading ? this.handleSearchClick : null}
              className="mr-auto ml-3"
            >
              Search
              {loading && 
                <Spinner 
                  animation="border" 
                  size="sm" 
                  variant="light"
                  className="ml-2"
                />}
            </Button>
          </Container>
        </Navbar>
        <div className="search-container col-8 mx-auto">
          {(searchResults && searchResults.length > 0) && 
            <div className="search-result-container">
              {searchResults.map((result, index) => (
                  <div id={`search-result-${index}`} className="search-result-item w-100" >
                    <Card>
                      <Card.Body>
                        <Row className="m-0">
                          <span>{result.topic}</span>
                          {result.caption && <span>
                              {' -> ' + result.caption} 
                            </span>}
                        </Row>
                        <span className="h5 mr-2">{result.title}</span>
                        <Card.Link className="d-inline" href={'https://' + result.url}>{result.url}</Card.Link>
                        <Accordion>
                          <Accordion.Toggle as={Button} variant="link" eventKey="0">
                            View Details
                          </Accordion.Toggle>
                          <Accordion.Collapse eventKey="0">
                            <Card.Body>{result.description}</Card.Body>
                          </Accordion.Collapse>
                        </Accordion>
                      </Card.Body>
                    </Card>
                  </div>
                )
              )}
            </div>
          }
        </div>
        <Alert 
          show={alertShow} 
          variant={alertType}
          className="col-6 mx-auto fixed-bottom fade" 
          dismissible
          onClose={() => this.dismissAlert()}
        >
          {alert}
        </Alert>
      </>
    )
  }
}

export default App;
