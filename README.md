# Heritage Travels Budget Estimator

Heritage Travels Budget Estimator is a full-stack web application that allows users to calculate custom travel costs for UNESCO World Heritage Sites globally based on trip duration, traveler count, and travel style.

The website gets its destination information from a custom FastAPI REST API instead of storing the landmark data directly inside the frontend.

### How the Website Uses the API

The website connects to the Heritage Travels API to retrieve the available worldwide landmark data and populate a cascading selection tool (Country → City → Landmark).

The API provides information such as:

* Landmark title
* Site type
* Country and City
* Description
* Established year
* Governing body
* Protection status
* Annual visitors
* Entry fee and local currency
* Estimated daily hotel rate

The frontend sends a secure, authenticated request to the API and receives the landmark data in JSON format to instantly calculate total trip costs (including accommodation, food, local transport, and entry fees) based on dynamic local rates.
