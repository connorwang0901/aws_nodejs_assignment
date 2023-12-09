# WebApp-Private Setup Guide

This guide walks you through the steps required to set up and deploy the `webapp-private` application on your local environment.

## Prerequisites

Before you begin, ensure that the following software and tools are installed on your machine:

1. **Node.js**: The application requires Node.js to run. If you haven't already installed it, you can [download it here](https://nodejs.org/).

2. **npm**: npm is a package manager tool essential for installing dependencies. It typically comes bundled with Node.js, so if you've installed Node.js, you should already have npm.

3. **PostgreSQL**: The application uses a PostgreSQL database. Ensure that you have PostgreSQL installed and running locally. [Follow this link](https://www.postgresql.org/download/) if you need to download and install PostgreSQL.

## Setting Up the Application

Follow these steps to set up the `webapp-private` application on your local machine:

### 1. Clone the Repository

```
git clone git@github.com:connorwang0901/webapp-private.git
```

### 2. Change Directory
Navigate to the root directory of the cloned repository:

```
cd webapp-private
```

### 3. Install Dependencies
Run the following command to install all the required dependencies:

```
npm install
```

### 4. Start the Server
To run the application, execute the server script:

```
node server.js 
```



