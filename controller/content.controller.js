const { readConfig } = require('../utils/readConfig')
// const { default: axios } = require("axios")
// const fs = require('fs');
// const path = require('path')
const { formatData } = require('../utils/formatData')

// const get_content_controller = async (req, res) => {
//     try {
//         if (!req?.query?.limit || !req?.query?.offset) return res.status(400).json({ error: 'The request parameters is missing.' })

//         const limit = req?.query?.limit
//         const offset = req?.query?.offset

//         const config = await readConfig()


//         const apiUrl = config?.configuration?.api?.contentUrl
//         const method = config?.configuration?.api?.method

//         const credentials = {
//             username: config?.authDetails?.username,
//             password: config?.authDetails?.password
//         };

//         const accessToken = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');

//         const headers = {
//             "Authorization": `Basic ${accessToken}`,
//             "Accept": "application/json",
//             "Content-Type": "application/json"
//         };

//         const limitKey = config?.configuration?.pagination?.limit
//         const offsetKey = config?.configuration?.pagination?.offset

//         let params = {}
//         params[limitKey] = limit
//         params[offsetKey] = offset

//         const reqOptions = {
//             url: apiUrl,
//             method: method,
//             headers: headers,
//             params: params
//         }


//         //  Uncomment this as per requirement
//         const response = await axios(reqOptions)
//         let data = await formatData(response?.data, config?.configuration?.lookupFields)
//         const hasMoreKey = config?.configuration?.hasMore
//         //this check is only for service now api
//         const headerLinkData = response?.headers?.link
//         data['isContentAvailable'] = (headerLinkData && headerLinkData.includes(hasMoreKey)) ?? JSON.stringify(data).includes(hasMoreKey);
//         return res.json(data)


//         // For testing purposes: Read from a sample file
//         const filePath = limit === "1"
//             ? path.join(__dirname, '../TestFiles/sampleDoc.txt')
//             : path.join(__dirname, '../TestFiles/sampleDocs.txt');
//         fs.readFile(filePath, 'utf8', (err, data) => {
//             if (err) {
//                 return res.status(500).json({ error: 'Failed to read the file.' });
//             }
//             try {
//                 const jsonData = JSON.parse(data);
//                 return res.json(jsonData);
//             } catch (parseError) {
//                 // Handle JSON parse errors
//                 return res.status(500).json({ error: 'Failed to parse the file content.' });
//             }
//         });

//     } catch (error) {
//         console.error('Error fetching data ', error.message)
//         return res.status(500).json({ error: error.message || "Failed to fetch data" })

//     }

// }

// module.exports = { get_content_controller }
const axios = require('axios');
const path = require('path');
const pdfParse = require('pdf-parse');
const specificIds = require("../utils/specificIds.js")
const fs = require('fs');

// OAuth2 Token Management
let tokenCache = {
    accessToken: null,
    expiryTime: null
};


// Function to get OAuth2 access token
async function getOAuth2Token(config) {
    // Check if token is still valid (with 5-minute buffer)
    if (tokenCache.accessToken && tokenCache.expiryTime && Date.now() < (tokenCache.expiryTime - 300000)) {
        console.log('Using cached OAuth2 token');
        return tokenCache.accessToken;
    }

    try {
        console.log('Fetching new OAuth2 token...');
        
        const tokenRequestData = {
            grant_type: 'client_credentials',
            client_id: config.authDetails.clientId,
            client_secret: config.authDetails.clientSecret
        };

        // Add scope if provided
        // if (config.authDetails.scope) {
        //     // tokenRequestData.scope = config.authDetails.scope;
        // }

        const response = await axios.post(config.authDetails.tokenUrl,tokenRequestData, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        

        tokenCache.accessToken = response.data.access_token;
        const expiresIn = response.data.expires_in || 3600; // Default 1 hour
        tokenCache.expiryTime = Date.now() + (expiresIn * 1000);

        console.log('OAuth2 token obtained successfully, expires in:', expiresIn, 'seconds');
        return tokenCache.accessToken;

    } catch (error) {
        console.error('Error obtaining OAuth2 token:', error.response?.data || error.message);
        throw new Error('Failed to obtain OAuth2 access token: ' + (error.response?.data?.error_description || error.message));
    }
}

// Function to get appropriate headers based on auth type
async function getAuthHeaders(config) {
    const authType = config?.authDetails?.authorizationType || 'BasicAuth';
    
    if (authType === 'OAuth2ClientCredentials') {
        const accessToken = await getOAuth2Token(config);
        return {
            "Authorization": `Bearer ${accessToken}`,
            "Accept": "application/json",
            "Content-Type": "application/json"
        };
    } else {
        // Default Basic Auth (your existing logic)
        const credentials = {
            username: config?.authDetails?.username,
            password: config?.authDetails?.password
        };
        const accessToken = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
        return {
            "Authorization": `Basic ${accessToken}`,
            "Accept": "application/json",
            "Content-Type": "application/json"
        };
    }
}

// const getPdf =async(pdfURl)=>{
//     try{
//         const response = await axios.get(pdfURl, { responseType: 'arraybuffer'});
//         return response.data;
//     } catch (err) {
//         console.error('PDF extraction failed:', err.message);
//         return [];
//     }
// }
const getPdfTextChunks = async (pdfUrl) => {
    
    try {
        const response = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
        
        const pdfData = await pdfParse(response.data);
        
        // Simple chunking: split by paragraphs (double newline)
        const chunks = pdfData.text.split(/\n\s*\n/).map(chunk => chunk.trim()).filter(Boolean);
        return chunks;
    } catch (err) {
        console.error('PDF extraction failed:', err.message);
        return [];
    }
};




const get_content_controller = async (req, res) => {
    console.log('=== INCOMING REQUEST ===');
    console.log('Query params:', req.query);
    console.log('Headers:', req.headers);
    
    try {
        if (!req?.query?.limit || !req?.query?.offset) {
            return res.status(400).json({ error: 'The request parameters is missing.' });
        }

        const limit = req?.query?.limit;
        const offset = req?.query?.offset;

        const config = await readConfig();
        console.log('Config loaded, auth type:', config?.authDetails?.authorizationType || 'BasicAuth');

        const apiUrl = config?.configuration?.api?.contentUrl;
        const method = config?.configuration?.api?.method;

        // Get headers based on authentication type
        const headers = await getAuthHeaders(config);
        console.log('Using auth type:', config?.authDetails?.authorizationType || 'BasicAuth');

        const limitKey = config?.configuration?.pagination?.limit; 
        const offsetKey = config?.configuration?.pagination?.offset; 

        // Prepare request data with pagination parameters
        const requestData = {
            provider: "intranet",
            [limitKey]: parseInt(limit) || 50,
            [offsetKey]: String(offset) || 0, 
            "extensions": [
                "pdf",
                "pptx"
              ]
        };

        const reqOptions = {
            url: apiUrl,
            method: method,
            headers: headers,
            params: {limit: parseInt(limit) || 50, offset: String(offset) || 0},
            data: requestData
        };

        console.log('Making API request to:', apiUrl);
        console.log('Request data:', requestData);

        // let isNoMorePagesAvailable = false;
        // Make API call
        const response = await axios(reqOptions);
        // await Promise.all(while(!isNoMorePagesAvailable) {
        //         await axios(reqOptions).then((res) => {
        //             if(res.data.isMorePagesAvailable) {
        //                 offsetValue+=20;
        //             } else {
        //                 isNoMorePagesAvailable = true;
        //             }
        //         });
        // })
        

        let rawResults = response?.data.result.listOfItems;
        const siteID = "ce875a99-0c0c-4177-ae39-df023cdce4ef"
        const filteredPDF = rawResults.filter((item)=> Array.isArray(item.listOfSite) &&
        item.listOfSite.length > 0 && item.listOfSite[0].siteId === siteID &&
        item.signedDownloadUrl)
        console.log("-----LLL---",filteredPDF.length)
       
        const previewBaseUrl = 'https://tarsanet.tarsusrx.com/file_preview';
        for (let item of filteredPDF) {
                // Join chunks for content field, or keep as array if needed            
                const chunks = await getPdfTextChunks(item.signedDownloadUrl);
                item.content = chunks.join('\n\n');
                // const pdfData = await getPdf(item.signedDownloadUrl);
                //  item.content = pdfData;
                
                // Construct preview URL using file id and site id for lookupFields.url
               
                if (item?.id) {
                    item.url = `${previewBaseUrl}/${item.id}/${siteID}`;
                }

        }
        
        let data = await formatData(filteredPDF, config?.configuration?.lookupFields);
        console.log('Formatted data length:', data.data.length || 0);
        
        // Check if there are more pages based on nextPageToken in response
        const nextPageToken = response?.data?.result?.nextPageToken;
        console.log("------------------",nextPageToken)
        data['isContentAvailable'] = Boolean(nextPageToken)
        // data['nextPageToken'] = nextPageToken; // Include the next token for client use
        
        console.log('isContentAvailable:', data['isContentAvailable']);
        console.log('=== SENDING RESPONSE ===');
        
        return res.json(data);

    } catch (error) {
        console.error('=== ERROR ===');
        console.error('Error fetching data:', error.message);
        console.error('Error details:', error.response?.data || error.stack);
        
        // Return error in the expected format
        return res.status(500).json({ 
            error: error.message || "Failed to fetch data",
            result: [],
            isContentAvailable: false
        });
    }
};

module.exports = {
    get_content_controller
};