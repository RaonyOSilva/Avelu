function options(hosted){return {
 contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],scriptSrcAttr:["'none'"],styleSrc:["'self'","'unsafe-inline'",'https://fonts.googleapis.com'],fontSrc:["'self'",'https://fonts.gstatic.com'],imgSrc:["'self'",'data:','https:'],connectSrc:["'self'"],objectSrc:["'none'"],baseUri:["'self'"],formAction:["'self'"],frameAncestors:["'none'"],frameSrc:["'self'"],workerSrc:["'self'"],upgradeInsecureRequests:hosted?[]:null}},
 strictTransportSecurity:hosted?{maxAge:31536000,includeSubDomains:false}:false,
 referrerPolicy:{policy:'no-referrer'}
};}
module.exports={options};
